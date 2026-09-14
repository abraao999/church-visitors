import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { GuestAccess } from '../models/GuestAccess.js';
import { HolyricsSettings } from '../models/HolyricsSettings.js';
import { PendingOwnerRegistration } from '../models/PendingOwnerRegistration.js';
import { PlatformAdmin, type PlatformAdminRole } from '../models/PlatformAdmin.js';
import {
  PLATFORM_AUDIT_OPERATIONS,
  PlatformAuditEvent,
  recordPlatformAudit,
  type PlatformAuditOperation,
} from '../models/PlatformAuditEvent.js';
import { PortariaDevice } from '../models/PortariaDevice.js';
import { PrayerRequest } from '../models/PrayerRequest.js';
import { Service } from '../models/Service.js';
import { User } from '../models/User.js';
import { Visitor } from '../models/Visitor.js';
import { normalizeChurchName } from '../utils/church.js';
import { createHighEntropyToken, normalizeEmail } from '../utils/emailCrypto.js';
import { escapeRegex, normalizedSearch } from '../utils/safeRegex.js';
import { createPendingOwnerRegistration, resendPendingOwnerRegistration } from './ownerRegistration.js';
import { requestPasswordResetForOwner } from './passwordReset.js';

export const PLATFORM_LOGIN_INVALID = 'E-mail ou senha inválidos.';
export const PLATFORM_LOGIN_UNAVAILABLE = 'Não foi possível entrar agora. Tente novamente em instantes.';
export const PLATFORM_CHURCH_NOT_FOUND = 'Igreja não encontrada.';
export const PLATFORM_FORBIDDEN = 'Você não tem permissão para esta ação.';

const BCRYPT_ROUNDS = 10;
let dummyHash: string | undefined;

function timingHash(): string {
  dummyHash ??= bcrypt.hashSync('platform-admin-timing-dummy', BCRYPT_ROUNDS);
  return dummyHash;
}

export type ChurchSituation = 'ativa' | 'pendente' | 'suspensa';

export type PlatformAdminActor = {
  adminId: string;
  name: string;
  email: string;
  role: PlatformAdminRole;
  tokenVersion: number;
};

function actorIds(actor: PlatformAdminActor) {
  return {
    platformAdminId: new Types.ObjectId(actor.adminId),
    platformAdminName: actor.name,
    platformAdminRole: actor.role,
  };
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export function churchSituation(input: {
  active: boolean;
  city?: string;
  emailVerifiedAt?: Date | null;
}): ChurchSituation {
  if (!input.active) return 'suspensa';
  if (!input.emailVerifiedAt || !(input.city || '').trim()) return 'pendente';
  return 'ativa';
}

function usernameFromEmail(email: string): string {
  const local = email.split('@')[0] || 'owner';
  const base = local
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 20);
  const padded = base.length >= 3 ? base : `${base}adm`.padEnd(3, 'x');
  return padded;
}

export async function authenticatePlatformAdmin(email: string, password: string): Promise<PlatformAdminActor> {
  const normalized = normalizeEmail(email);
  const admin = await PlatformAdmin.findOne({ email: normalized });
  const hash = admin?.passwordHash || timingHash();
  const ok = await bcrypt.compare(password, hash);
  if (!admin || admin.active === false || !ok) {
    throw new Error('invalid');
  }
  const now = new Date();
  admin.lastSeenAt = now;
  if (!admin.emailVerifiedAt) admin.emailVerifiedAt = now;
  await admin.save();
  return {
    adminId: String(admin._id),
    name: admin.name,
    email: admin.email,
    role: admin.role,
    tokenVersion: admin.tokenVersion ?? 0,
  };
}

export async function loadPlatformAdminOverview() {
  const today = startOfToday();
  const month = startOfMonth();
  const since = daysAgo(30);

  const [
    churchesTotal,
    churchesActive,
    churchesSuspended,
    usersActive,
    churchesThisMonth,
    usersSeenToday,
    unconfirmedOwners,
    incompleteChurches,
    churchesWithVisitors,
    churchesWithServices,
    churchesWithPrayers,
    churchesWithPortaria,
  ] = await Promise.all([
    Church.countDocuments({}),
    Church.countDocuments({ active: true }),
    Church.countDocuments({ active: false }),
    User.countDocuments({ active: true }),
    Church.countDocuments({ createdAt: { $gte: month } }),
    User.countDocuments({ lastSeenAt: { $gte: today } }),
    PendingOwnerRegistration.countDocuments({ consumedAt: null }),
    Church.countDocuments({ active: true, $or: [{ city: '' }, { city: { $exists: false } }] }),
    Visitor.distinct('churchId', { createdAt: { $gte: since } }),
    Service.distinct('churchId'),
    PrayerRequest.distinct('churchId', { createdAt: { $gte: since } }),
    PortariaDevice.distinct('churchId', { active: true, revokedAt: null }),
  ]);

  const pendingItems: Array<{
    key: string;
    title: string;
    detail: string;
    actionLabel: string;
    href: string;
  }> = [];

  if (unconfirmedOwners > 0) {
    pendingItems.push({
      key: 'unconfirmed',
      title: `${unconfirmedOwners} e-mail${unconfirmedOwners === 1 ? '' : 's'} ainda não confirmado${unconfirmedOwners === 1 ? '' : 's'}`,
      detail: 'Proprietários aguardando ativação da conta',
      actionLabel: 'Ver igrejas',
      href: '/admin/igrejas?situacao=pendente',
    });
  }
  if (incompleteChurches > 0) {
    pendingItems.push({
      key: 'incomplete',
      title: `${incompleteChurches} igreja${incompleteChurches === 1 ? '' : 's'} com cadastro incompleto`,
      detail: 'Falta a cidade no cadastro da igreja',
      actionLabel: 'Ver igreja',
      href: '/admin/igrejas?situacao=pendente',
    });
  }
  if (churchesSuspended > 0) {
    pendingItems.push({
      key: 'suspended',
      title: `${churchesSuspended} igreja${churchesSuspended === 1 ? '' : 's'} suspensa${churchesSuspended === 1 ? '' : 's'}`,
      detail: 'Acesso da equipe e dos formulários públicos está bloqueado',
      actionLabel: 'Revisar situação',
      href: '/admin/igrejas?situacao=suspensa',
    });
  }

  const usageDenom = churchesTotal || 1;
  const usage = [
    { key: 'visitors', label: 'Visitantes', churches: churchesWithVisitors.length },
    { key: 'services', label: 'Cultos', churches: churchesWithServices.length },
    { key: 'prayers', label: 'Pedidos de oração', churches: churchesWithPrayers.length },
    { key: 'portaria', label: 'Portaria PWA', churches: churchesWithPortaria.length },
  ].map((item) => ({
    ...item,
    percent: Math.round((item.churches / usageDenom) * 100),
  }));

  return {
    churchesTotal,
    churchesActive,
    churchesSuspended,
    churchesPending: incompleteChurches + unconfirmedOwners,
    usersActive,
    churchesThisMonth,
    usersSeenToday,
    pendingItems,
    usage,
  };
}

export async function listPlatformAuditEvents(input: {
  q?: string;
  operation?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Number.isInteger(input.page) && (input.page as number) > 0 ? (input.page as number) : 1;
  const pageSize = Math.min(50, Math.max(1, Number.isInteger(input.pageSize) ? (input.pageSize as number) : 20));
  const q = normalizedSearch(input.q || '');
  const operation = PLATFORM_AUDIT_OPERATIONS.includes(input.operation as PlatformAuditOperation)
    ? input.operation
    : '';
  const match: Record<string, unknown> = {};
  if (operation) match.operation = operation;
  const regex = q ? new RegExp(escapeRegex(q), 'i') : null;
  const start = (page - 1) * pageSize;

  const [result] = await PlatformAuditEvent.aggregate<{
    items: Array<{
      _id: Types.ObjectId;
      platformAdminName?: string;
      platformAdminRole?: PlatformAdminRole;
      operation: PlatformAuditOperation;
      targetType?: string;
      targetId?: string;
      reason?: string;
      createdAt: Date;
      church?: { name?: string };
    }>;
    total: Array<{ count: number }>;
  }>([
    { $match: match },
    {
      $lookup: {
        from: 'churches',
        localField: 'churchId',
        foreignField: '_id',
        as: 'churchDocs',
      },
    },
    { $addFields: { church: { $first: '$churchDocs' } } },
    ...(regex
      ? [{ $match: { $or: [{ platformAdminName: regex }, { 'church.name': regex }] } }]
      : []),
    { $sort: { createdAt: -1 as const } },
    {
      $facet: {
        items: [
          { $skip: start },
          { $limit: pageSize },
          {
            $project: {
              platformAdminName: 1,
              platformAdminRole: 1,
              operation: 1,
              targetType: 1,
              targetId: 1,
              reason: 1,
              createdAt: 1,
              'church.name': 1,
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const total = result?.total[0]?.count || 0;
  return {
    items: (result?.items || []).map((event) => ({
      id: String(event._id),
      adminName: event.platformAdminName || 'Sistema',
      adminRole: event.platformAdminRole || null,
      operation: event.operation,
      churchName: event.church?.name || null,
      churchId: event.targetType === 'church' ? event.targetId || null : null,
      reason: event.reason || null,
      createdAt: event.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function listPlatformAdmins() {
  const admins = await PlatformAdmin.find(
    {},
    'name email role active lastSeenAt createdAt'
  ).sort({ active: -1, role: 1, name: 1 });
  return {
    items: admins.map((admin) => ({
      id: String(admin._id),
      name: admin.name,
      email: admin.email,
      role: admin.role,
      active: admin.active !== false,
      lastSeenAt: admin.lastSeenAt?.toISOString() || null,
      createdAt: admin.createdAt.toISOString(),
    })),
  };
}

export async function createPlatformAdmin(
  input: { name: string; email: string; password: string; role: string },
  actor: PlatformAdminActor
) {
  const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 120);
  const email = normalizeEmail(input.email);
  const password = input.password;
  const role = input.role === 'support' || input.role === 'viewer' ? input.role : '';
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !role) throw new Error('invalid');
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error('password');
  if (await PlatformAdmin.exists({ email })) throw new Error('duplicate');

  const admin = await PlatformAdmin.create({
    name,
    email,
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    role,
    active: true,
    emailVerifiedAt: new Date(),
    tokenVersion: 0,
  });
  await recordPlatformAudit({
    ...actorIds(actor),
    operation: 'admin_changed',
    targetType: 'platform_admin',
    targetId: String(admin._id),
    metadata: { action: 'created', role },
  });
  return { id: String(admin._id) };
}

export async function updatePlatformAdmin(
  adminId: string,
  input: { role?: string; active?: boolean },
  actor: PlatformAdminActor
) {
  if (!Types.ObjectId.isValid(adminId)) throw new Error('not_found');
  const admin = await PlatformAdmin.findById(adminId);
  if (!admin) throw new Error('not_found');
  const nextRole = input.role === 'platform_owner' || input.role === 'support' || input.role === 'viewer'
    ? input.role
    : admin.role;
  const nextActive = typeof input.active === 'boolean' ? input.active : admin.active !== false;
  if (String(admin._id) === actor.adminId && (!nextActive || nextRole !== 'platform_owner')) throw new Error('self');

  const removesOwner = admin.active !== false && admin.role === 'platform_owner' && (!nextActive || nextRole !== 'platform_owner');
  if (removesOwner) {
    const owners = await PlatformAdmin.countDocuments({ role: 'platform_owner', active: true });
    if (owners <= 1) throw new Error('last_owner');
  }

  const changed = admin.role !== nextRole || (admin.active !== false) !== nextActive;
  admin.role = nextRole;
  admin.active = nextActive;
  if (changed) admin.tokenVersion = (admin.tokenVersion || 0) + 1;
  await admin.save();
  if (changed) {
    await recordPlatformAudit({
      ...actorIds(actor),
      operation: 'admin_changed',
      targetType: 'platform_admin',
      targetId: String(admin._id),
      metadata: { action: nextActive ? 'updated' : 'deactivated', role: nextRole },
    });
  }
  return { ok: true as const };
}

export async function listPlatformChurches(input: {
  q?: string;
  situacao?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Number.isInteger(input.page) && (input.page as number) > 0 ? (input.page as number) : 1;
  const pageSize = Math.min(50, Math.max(1, Number.isInteger(input.pageSize) ? (input.pageSize as number) : 20));
  const q = normalizedSearch(input.q || '');
  const situacao = input.situacao === 'ativa' || input.situacao === 'pendente' || input.situacao === 'suspensa'
    ? input.situacao
    : '';

  const churchMatch: Record<string, unknown> = {};
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    const owners = await User.find(
      { role: 'owner', $or: [{ name: regex }, { email: regex }] },
      'churchId'
    ).limit(200);
    churchMatch.$or = [{ name: regex }, { _id: { $in: owners.map((owner) => owner.churchId) } }];
  }

  const start = (page - 1) * pageSize;
  const [result] = await Church.aggregate<{
    items: Array<{
      _id: Types.ObjectId;
      name: string;
      city?: string;
      createdAt: Date;
      situation: ChurchSituation;
      owner?: { name?: string; email?: string; lastSeenAt?: Date };
      members?: { count: number; lastSeenAt?: Date };
    }>;
    total: Array<{ count: number }>;
  }>([
    { $match: churchMatch },
    {
      $lookup: {
        from: 'users',
        let: { cid: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$churchId', '$$cid'] }, { $eq: ['$role', 'owner'] }] } } },
          { $project: { name: 1, email: 1, emailVerifiedAt: 1, lastSeenAt: 1 } },
          { $limit: 1 },
        ],
        as: 'ownerDocs',
      },
    },
    {
      $lookup: {
        from: 'users',
        let: { cid: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$churchId', '$$cid'] }, { $eq: ['$active', true] }] } } },
          { $group: { _id: null, count: { $sum: 1 }, lastSeenAt: { $max: '$lastSeenAt' } } },
        ],
        as: 'memberDocs',
      },
    },
    {
      $addFields: {
        owner: { $first: '$ownerDocs' },
        members: { $first: '$memberDocs' },
      },
    },
    {
      $addFields: {
        situation: {
          $cond: [
            { $eq: ['$active', false] },
            'suspensa',
            {
              $cond: [
                {
                  $or: [
                    { $eq: [{ $ifNull: ['$owner.emailVerifiedAt', null] }, null] },
                    { $eq: [{ $ifNull: ['$city', ''] }, ''] },
                  ],
                },
                'pendente',
                'ativa',
              ],
            },
          ],
        },
      },
    },
    ...(situacao ? [{ $match: { situation: situacao } }] : []),
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        items: [{ $skip: start }, { $limit: pageSize }],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const total = result?.total[0]?.count || 0;
  return {
    items: (result?.items || []).map((church) => ({
      id: String(church._id),
      name: church.name,
      city: church.city || '',
      situation: church.situation,
      ownerName: church.owner?.name || '',
      ownerEmail: church.owner?.email || '',
      memberCount: church.members?.count || 0,
      lastSeenAt: church.members?.lastSeenAt?.toISOString() || church.owner?.lastSeenAt?.toISOString() || null,
      createdAt: church.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getPlatformChurchDetail(churchId: string) {
  if (!Types.ObjectId.isValid(churchId)) {
    throw new Error('not_found');
  }
  const id = new Types.ObjectId(churchId);
  const church = await Church.findById(id, 'name city active createdAt visitorFollowUpEnabled branding');
  if (!church) throw new Error('not_found');

  const owner = await User.findOne(
    { churchId: id, role: 'owner' },
    'name email lastSeenAt emailVerifiedAt active'
  );
  const [memberCount, visitorCount, serviceCount, publicAccessCount, deviceCount, holyrics] = await Promise.all([
    User.countDocuments({ churchId: id, active: true }),
    Visitor.countDocuments({ churchId: id }),
    Service.countDocuments({ churchId: id }),
    GuestAccess.countDocuments({ churchId: id, active: true }),
    PortariaDevice.countDocuments({ churchId: id, active: true, revokedAt: null }),
    HolyricsSettings.exists({ churchId: id }),
  ]);

  const resources = [
    { key: 'followUp', label: 'Acompanhamento de visitantes', enabled: Boolean(church.visitorFollowUpEnabled) },
    {
      key: 'branding',
      label: 'Identidade personalizada',
      enabled: Boolean(church.branding?.logoUrl || church.branding?.primaryColor || church.branding?.accentColor),
    },
    { key: 'portaria', label: 'Portaria PWA', enabled: deviceCount > 0 },
    { key: 'holyrics', label: 'Holyrics configurado', enabled: Boolean(holyrics) },
  ];

  return {
    id: String(church._id),
    name: church.name,
    city: church.city || '',
    situation: churchSituation({
      active: church.active !== false,
      city: church.city,
      emailVerifiedAt: owner?.emailVerifiedAt,
    }),
    createdAt: church.createdAt.toISOString(),
    lastSeenAt: owner?.lastSeenAt?.toISOString() || null,
    owner: owner
      ? {
          name: owner.name,
          email: owner.email,
          emailVerified: Boolean(owner.emailVerifiedAt),
          active: owner.active !== false,
        }
      : null,
    memberCount,
    visitorCount,
    serviceCount,
    publicAccessCount,
    deviceCount,
    resources,
  };
}

export async function createAssistedChurch(
  input: { churchName: string; ownerName: string; ownerEmail: string; city?: string },
  actor: PlatformAdminActor
) {
  const churchName = normalizeChurchName(input.churchName);
  const ownerName = input.ownerName.trim().replace(/\s+/g, ' ').slice(0, 120);
  const ownerEmail = normalizeEmail(input.ownerEmail);
  const city = (input.city || '').trim().slice(0, 100);

  if (!churchName || !ownerName || !ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    throw new Error('invalid');
  }

  const existing = await User.findOne({ email: ownerEmail }, '_id');
  if (existing) {
    throw new Error('duplicate');
  }

  let username = usernameFromEmail(ownerEmail);
  const taken = await User.findOne({ username }, '_id');
  const pendingTaken = await PendingOwnerRegistration.findOne({ username }, '_id');
  if (taken || pendingTaken) {
    username = `${username.slice(0, 16)}${randomBytes(2).toString('hex')}`;
  }

  const passwordHash = await bcrypt.hash(createHighEntropyToken(), BCRYPT_ROUNDS);
  const pending = await createPendingOwnerRegistration({
    churchName,
    name: ownerName,
    email: ownerEmail,
    username,
    passwordHash,
    city,
    assisted: true,
  });

  await recordPlatformAudit({
    ...actorIds(actor),
    operation: 'church_assisted_created',
    targetType: 'pending_registration',
    targetId: pending.challengeId,
    metadata: { cityProvided: Boolean(city) },
  });

  return pending;
}

export async function suspendPlatformChurch(
  churchId: string,
  reason: string,
  confirmName: string,
  actor: PlatformAdminActor
) {
  if (!Types.ObjectId.isValid(churchId)) throw new Error('not_found');
  const trimmedReason = reason.trim().slice(0, 400);
  const typed = confirmName.trim();
  if (!trimmedReason) throw new Error('reason');
  const church = await Church.findById(churchId);
  if (!church) throw new Error('not_found');
  if (typed.normalize('NFD').toLowerCase() !== church.name.normalize('NFD').toLowerCase()) {
    throw new Error('confirm');
  }

  church.active = false;
  await church.save();
  await User.updateMany({ churchId: church._id }, { $inc: { tokenVersion: 1 } });

  await recordPlatformAudit({
    ...actorIds(actor),
    operation: 'church_suspended',
    targetType: 'church',
    targetId: String(church._id),
    churchId: church._id as Types.ObjectId,
    reason: trimmedReason,
  });

  return { ok: true as const };
}

export async function reactivatePlatformChurch(churchId: string, actor: PlatformAdminActor) {
  if (!Types.ObjectId.isValid(churchId)) throw new Error('not_found');
  const church = await Church.findById(churchId);
  if (!church) throw new Error('not_found');
  church.active = true;
  await church.save();
  await recordPlatformAudit({
    ...actorIds(actor),
    operation: 'church_reactivated',
    targetType: 'church',
    targetId: String(church._id),
    churchId: church._id as Types.ObjectId,
  });
  return { ok: true as const };
}

export async function sendPlatformPasswordReset(churchId: string, actor: PlatformAdminActor) {
  if (!Types.ObjectId.isValid(churchId)) throw new Error('not_found');
  const church = await Church.findById(churchId, '_id');
  if (!church) throw new Error('not_found');
  const owner = await User.findOne({ churchId: church._id, role: 'owner' }, '_id');
  if (!owner) throw new Error('not_found');
  await requestPasswordResetForOwner(owner._id as Types.ObjectId);
  await recordPlatformAudit({
    ...actorIds(actor),
    operation: 'password_reset_requested',
    targetType: 'church',
    targetId: String(church._id),
    churchId: church._id as Types.ObjectId,
  });
  return { ok: true as const };
}

export async function resendPlatformVerification(churchId: string, actor: PlatformAdminActor) {
  if (!Types.ObjectId.isValid(churchId)) throw new Error('not_found');
  const church = await Church.findById(churchId, 'name');
  if (!church) throw new Error('not_found');
  const owner = await User.findOne({ churchId: church._id, role: 'owner' }, 'email emailVerifiedAt');
  if (owner?.emailVerifiedAt) throw new Error('already_verified');

  const pending = await PendingOwnerRegistration.findOne({
    email: owner?.email,
    consumedAt: null,
  });
  if (!pending) {
    throw new Error('no_pending');
  }
  await resendPendingOwnerRegistration(pending.challengeId);
  await recordPlatformAudit({
    ...actorIds(actor),
    operation: 'verification_resent',
    targetType: 'church',
    targetId: String(church._id),
    churchId: church._id as Types.ObjectId,
  });
  return { ok: true as const };
}
