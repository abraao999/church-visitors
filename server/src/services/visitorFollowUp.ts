import { Types } from 'mongoose';
import { toActor, type AuthenticatedRequest } from '../middleware/auth.js';
import { Church } from '../models/Church.js';
import { FollowUpContact } from '../models/FollowUpContact.js';
import { User } from '../models/User.js';
import { Visitor } from '../models/Visitor.js';
import { VisitorFollowUp, type FollowUpSource } from '../models/VisitorFollowUp.js';
import { CHURCH_TIMEZONE } from '../utils/dayRange.js';
import { hasPermission, type Permission } from '../utils/permissions.js';
import { tenantRecordFilter, withChurch } from '../utils/tenant.js';
import {
  FOLLOW_UP_DISABLED_ERROR,
  dateKeyInZone,
  escapeSearch,
  formatFollowUpPhone,
  isValidFollowUpPhone,
  normalizeFollowUpPhone,
  parseFollowUpNote,
  resolveNextContactAt,
  sanitizeSearch,
  type FollowUpPreset,
  type FollowUpStatus,
} from '../utils/visitorFollowUp.js';

export async function loadFollowUpChurch(churchId: string) {
  return Church.findById(churchId).select('visitorFollowUpEnabled timezone active');
}

export async function assertFollowUpEnabled(churchId: string) {
  const church = await loadFollowUpChurch(churchId);
  if (!church || church.active === false || church.visitorFollowUpEnabled !== true) {
    return { error: FOLLOW_UP_DISABLED_ERROR, status: 403 as const };
  }
  return {
    timezone: church.timezone || CHURCH_TIMEZONE,
  };
}

export function canUseFollowUp(
  permissions: readonly string[] | undefined,
  permission: Permission
) {
  return hasPermission(permissions, permission);
}

export async function resolveAssignee(churchId: string, assignedToId: unknown) {
  if (assignedToId == null || assignedToId === '' || assignedToId === 'later') {
    return {};
  }
  if (typeof assignedToId !== 'string' || !Types.ObjectId.isValid(assignedToId)) {
    return { error: 'Escolha um responsável da equipe desta igreja.' };
  }
  const user = await User.findOne(
    withChurch(churchId, { _id: new Types.ObjectId(assignedToId), active: { $ne: false } })
  ).select('name');
  if (!user) {
    return { error: 'O responsável precisa pertencer a esta igreja.' };
  }
  return { assignedTo: user._id as Types.ObjectId, assignedToName: user.name };
}

export async function createFollowUpRecord(input: {
  churchId: string;
  visitorId: Types.ObjectId | string;
  phone?: string;
  assignedToId?: unknown;
  nextContactAt?: Date;
  consent: boolean;
  source: FollowUpSource;
  createdBy?: { name: string };
}) {
  const visitorFilter = tenantRecordFilter(input.churchId, input.visitorId);
  if (!visitorFilter) {
    return { error: 'Visitante não encontrado', status: 404 as const };
  }
  const visitor = await Visitor.findOne(visitorFilter).select('_id name anonymizedAt');
  if (!visitor || visitor.anonymizedAt) {
    return { error: 'Visitante não encontrado', status: 404 as const };
  }

  const existing = await VisitorFollowUp.findOne(
    withChurch(input.churchId, { visitorId: visitor._id })
  ).select('_id');
  if (existing) {
    return { error: 'Este visitante já está no acompanhamento.', status: 409 as const };
  }

  const assignee = await resolveAssignee(input.churchId, input.assignedToId);
  if ('error' in assignee && assignee.error) {
    return { error: assignee.error, status: 400 as const };
  }

  const phone = normalizeFollowUpPhone(input.phone);
  try {
    const created = await VisitorFollowUp.create({
      churchId: input.churchId,
      visitorId: visitor._id,
      phone,
      assignedTo: assignee.assignedTo,
      assignedToName: assignee.assignedToName || '',
      status: 'awaiting',
      nextContactAt: input.nextContactAt,
      consent: input.consent === true,
      source: input.source,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    });
    return { followUp: created };
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
      return { error: 'Este visitante já está no acompanhamento.', status: 409 as const };
    }
    throw error;
  }
}

export function serializeFollowUp(
  item: {
    _id?: unknown;
    visitorId?: unknown;
    phone?: string;
    assignedTo?: unknown;
    assignedToName?: string;
    status: FollowUpStatus;
    nextContactAt?: Date | string;
    consent?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  },
  visitor: { name?: string; city?: string; visitDate?: Date | string } | undefined,
  options: { includePhone: boolean; timeZone: string }
) {
  const nextContactAt = item.nextContactAt ? new Date(item.nextContactAt) : undefined;
  const todayKey = dateKeyInZone(new Date(), options.timeZone);
  const nextKey = nextContactAt ? dateKeyInZone(nextContactAt, options.timeZone) : '';
  return {
    id: String(item._id),
    visitorId: String(item.visitorId),
    visitorName: visitor?.name || 'Visitante',
    city: visitor?.city || '',
    visitDate: visitor?.visitDate,
    status: item.status,
    assignedToId: item.assignedTo ? String(item.assignedTo) : undefined,
    assignedToName: item.assignedToName?.trim() || undefined,
    nextContactAt: item.nextContactAt,
    nextContactIsToday: Boolean(nextKey && nextKey === todayKey && item.status !== 'closed'),
    consent: item.consent === true,
    phone: options.includePhone && item.phone ? formatFollowUpPhone(item.phone) : undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export async function listAssignees(churchId: string) {
  const members = await User.find(withChurch(churchId, { active: { $ne: false } }))
    .select('name')
    .sort({ name: 1 });
  return members.map((member) => ({
    id: String(member._id),
    name: member.name,
  }));
}

export async function searchAvailableVisitors(churchId: string, query: unknown) {
  const q = sanitizeSearch(query);
  const taken = await VisitorFollowUp.find(withChurch(churchId, { anonymizedAt: { $exists: false } }))
    .select('visitorId')
    .lean();
  const takenIds = taken.map((item) => item.visitorId);
  const filter: Record<string, unknown> = {
    anonymizedAt: { $exists: false },
  };
  if (takenIds.length) {
    filter._id = { $nin: takenIds };
  }
  if (q) {
    filter.name = { $regex: escapeSearch(q), $options: 'i' };
  }
  const visitors = await Visitor.find(withChurch(churchId, filter))
    .select('name city visitDate')
    .sort({ visitDate: -1, createdAt: -1 })
    .limit(30);
  return visitors.map((visitor) => ({
    id: String(visitor._id),
    name: visitor.name,
    city: visitor.city,
    visitDate: visitor.visitDate,
  }));
}

export function parseCreateFollowUpBody(
  body: Record<string, unknown>,
  now: Date,
  timeZone: string
): { error: string } | { phone: string; assignedToId: unknown; nextContactAt?: Date } {
  const phone = normalizeFollowUpPhone(body.phone);
  if (body.phone != null && typeof body.phone === 'string' && body.phone.trim() && !isValidFollowUpPhone(phone)) {
    return { error: 'Informe um telefone válido com DDD.' };
  }
  const next = resolveNextContactAt(
    (body.firstContact as FollowUpPreset) || 'tomorrow',
    body.firstContactDate,
    now,
    timeZone
  );
  if (next.error) return { error: next.error };
  return {
    phone,
    assignedToId: body.assignedToId,
    nextContactAt: next.date,
  };
}

export function parseContactBody(
  body: Record<string, unknown>,
  timeZone: string
):
  | { error: string }
  | {
      contactedAt: Date;
      type: 'call' | 'whatsapp' | 'visit' | 'other';
      result: string;
      note: string;
      status: FollowUpStatus;
      nextContactAt?: Date;
    } {
  const contactedAtRaw = body.contactedAt;
  const contactedAt =
    typeof contactedAtRaw === 'string' && contactedAtRaw
      ? new Date(contactedAtRaw)
      : new Date();
  if (Number.isNaN(contactedAt.getTime())) {
    return { error: 'Informe a data e o horário do contato.' };
  }
  const type = body.type;
  if (type !== 'call' && type !== 'whatsapp' && type !== 'visit' && type !== 'other') {
    return { error: 'Escolha o tipo de contato.' };
  }
  const result = parseFollowUpNote(body.result, 200);
  if (!result) {
    return { error: 'Informe o resultado do contato.' };
  }
  const note = parseFollowUpNote(body.note, 500);
  const status = body.status;
  if (
    status !== 'awaiting' &&
    status !== 'contacted' &&
    status !== 'integrating' &&
    status !== 'closed'
  ) {
    return { error: 'Escolha a situação do acompanhamento.' };
  }
  let nextContactAt: Date | undefined;
  if (body.nextContactAt) {
    const parsed =
      typeof body.nextContactAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.nextContactAt)
        ? resolveNextContactAt('custom', body.nextContactAt, contactedAt, timeZone)
        : { date: new Date(String(body.nextContactAt)) };
    if ('error' in parsed && parsed.error) return { error: parsed.error };
    if (parsed.date && !Number.isNaN(parsed.date.getTime())) {
      nextContactAt = parsed.date;
    }
  }
  return { contactedAt, type, result, note, status, nextContactAt };
}

export async function removeFollowUpForVisitor(churchId: string, visitorId: Types.ObjectId) {
  await FollowUpContact.deleteMany(withChurch(churchId, { visitorId }));
  await VisitorFollowUp.deleteMany(withChurch(churchId, { visitorId }));
}

export function actorFromRequest(req: AuthenticatedRequest) {
  return toActor(req.auth!);
}
