import { Router, type Response } from 'express';
import {
  markGuestAccessUsed,
  requireGuestAccess,
  type GuestAccessRequest,
} from '../middleware/guestAccess.js';
import { PrayerRequest } from '../models/PrayerRequest.js';
import { Visitor, RELATIONSHIPS } from '../models/Visitor.js';
import {
  VehicleNotice,
  isVehicleNoticeAction,
} from '../models/VehicleNotice.js';
import type { Relationship } from '../constants/relationships.js';
import {
  fetchHymnPanel,
  fetchPrayerPanel,
  fetchVehicleNoticePanel,
  fetchVisitorPanel,
  fetchWorshipPanel,
} from '../services/panelData.js';
import { normalizePanelObservation, readShowObservationOnPanel } from '../utils/panelText.js';
import { resolveActiveService } from '../services/activeService.js';
import { parseDateOnly } from '../utils/dayRange.js';
import { parseVehiclePlate } from '../utils/vehiclePlate.js';
import { Types } from 'mongoose';
import { publicAccessMetadata } from '../utils/branding.js';
import { createFollowUpRecord } from '../services/visitorFollowUp.js';
import {
  FOLLOW_UP_PHONE_REQUIRED_ERROR,
  isValidFollowUpPhone,
  normalizeFollowUpPhone,
  resolveNextContactAt,
} from '../utils/visitorFollowUp.js';
import { CHURCH_TIMEZONE } from '../utils/dayRange.js';
import {
  PUBLIC_ACCESS_CHANNELS,
  PUBLIC_ACCESS_EVENT_TYPES,
  PublicAccessEvent,
  type PublicAccessChannel,
  type PublicAccessEventType,
} from '../models/PublicAccessEvent.js';
import { parseVisitKind } from '../utils/reportRange.js';

const router = Router();
const MAX_VISITORS_PER_REQUEST = 10;
const MAX_DETAILS_LENGTH = 500;
const MAX_OTHER_DESCRIPTION = 240;
const DUPLICATE_WINDOW_MS = 20_000;

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

function normalizeSingleLine(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function isRelationship(value: unknown): value is Relationship {
  return typeof value === 'string' && RELATIONSHIPS.includes(value as Relationship);
}

function rejectsClientChurchId(body: unknown): boolean {
  return Boolean(body && typeof body === 'object' && 'churchId' in body);
}

function rejectsClientServiceId(body: unknown): boolean {
  return Boolean(body && typeof body === 'object' && 'serviceId' in body);
}

function bodyHasStaffFollowUpFields(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const value = body as Record<string, unknown>;
  return (
    'assignedToId' in value ||
    'status' in value ||
    'history' in value ||
    'nextContactAt' in value ||
    'responsible' in value
  );
}

async function activeServiceId(churchId: string) {
  const active = await resolveActiveService(churchId);
  return active?._id;
}

function parseAccessChannel(value: unknown): PublicAccessChannel {
  if (value === 'qr' || value === 'shared_link') return value;
  if (value === 'link') return 'shared_link';
  return 'shared_link';
}

async function recordPublicEvent(
  req: GuestAccessRequest,
  type: PublicAccessEventType,
  channel?: PublicAccessChannel
) {
  const access = req.guestAccess!;
  await PublicAccessEvent.create({
    churchId: access.churchId,
    guestAccessId: access.guestAccessId,
    purpose: access.scope,
    type,
    channel: channel || parseAccessChannel(req.query.origem ?? req.body?.channel ?? req.body?.origem),
  });
}

export async function createPublicAccessEvent(req: GuestAccessRequest, res: Response) {
  try {
    if (rejectsClientChurchId(req.body)) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    }
    const type = req.body?.type;
    if (!PUBLIC_ACCESS_EVENT_TYPES.includes(type as PublicAccessEventType)) {
      return res.status(400).json({ error: 'Informe um evento válido.' });
    }
    const channel = parseAccessChannel(req.body?.channel ?? req.body?.origem ?? req.query.origem);
    if (!PUBLIC_ACCESS_CHANNELS.includes(channel)) {
      return res.status(400).json({ error: 'Informe a origem do acesso.' });
    }
    await recordPublicEvent(req, type, channel);
    return res.status(201).json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Não foi possível registrar o evento.' });
  }
}

router.get('/:token', requireGuestAccess(), (req: GuestAccessRequest, res: Response) => {
  res.json(publicAccessMetadata(req.guestAccess!));
});

router.post('/:token/events', requireGuestAccess(), createPublicAccessEvent);

function parseRequestId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const requestId = value.trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) return undefined;
  return requestId;
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export async function createPublicVisitors(req: GuestAccessRequest, res: Response) {
  try {
    if (rejectsClientChurchId(req.body)) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    }
    if (rejectsClientServiceId(req.body)) {
      return res.status(400).json({ error: 'O culto não pode ser escolhido neste envio.' });
    }
    if (bodyHasStaffFollowUpFields(req.body)) {
      return res.status(400).json({ error: 'Estas informações não podem ser enviadas neste acesso.' });
    }

    const body =
      req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const rawVisitors = body.visitors;
    if (
      !Array.isArray(rawVisitors) ||
      rawVisitors.length === 0 ||
      rawVisitors.length > MAX_VISITORS_PER_REQUEST
    ) {
      return res.status(400).json({
        error: `Informe de 1 a ${MAX_VISITORS_PER_REQUEST} visitantes por envio.`,
      });
    }

    const visitors = rawVisitors.map((raw) => {
      if (!raw || typeof raw !== 'object' || 'churchId' in raw || 'serviceId' in raw) return null;
      const item = raw as Record<string, unknown>;
      const name = normalizeSingleLine(item.name, 120);
      const city = normalizeSingleLine(item.city, 100);
      const relationshipRaw = typeof item.relationship === 'string' ? item.relationship : 'outro';
      if (!name || !city || !isRelationship(relationshipRaw)) return null;
      return {
        name,
        city,
        relationship: relationshipRaw,
        panelObservation: normalizePanelObservation(item.panelObservation),
        showObservationOnPanel: readShowObservationOnPanel(item.showObservationOnPanel),
        visitKind: parseVisitKind(item.visitKind),
      };
    });

    const people = visitors.filter((visitor): visitor is NonNullable<typeof visitor> => visitor !== null);
    if (people.length !== rawVisitors.length) {
      return res.status(400).json({
        error: 'Informe o nome e a cidade de cada visitante.',
      });
    }

    const access = req.guestAccess!;
    const churchId = new Types.ObjectId(access.churchId);
    const guestAccessId = new Types.ObjectId(access.guestAccessId);
    const requestId = parseRequestId(body.requestId);
    const guestAccess = {
      guestAccessId: access.guestAccessId,
      name: access.accessName,
      type: access.scope,
    };

    if (requestId) {
      const replayed = await Visitor.exists({ churchId, requestId });
      if (replayed) {
        return res.status(201).json({ success: true, message: 'Informações enviadas' });
      }
    }

    const first = people[0];
    if (!first) {
      return res.status(400).json({
        error: 'Informe o nome e a cidade de cada visitante.',
      });
    }

    const recentDuplicate = await Visitor.exists({
      churchId,
      'guestAccess.guestAccessId': guestAccessId,
      name: first.name,
      city: first.city,
      createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    });
    if (recentDuplicate) {
      return res.status(201).json({ success: true, message: 'Informações enviadas' });
    }

    const serviceId = await activeServiceId(access.churchId);
    const followUpEnabled = access.visitorFollowUpEnabled === true;
    const contactConsent = followUpEnabled && body.contactConsent === true;
    const phone = contactConsent ? normalizeFollowUpPhone(body.phone) : '';
    if (contactConsent && !isValidFollowUpPhone(phone)) {
      return res.status(400).json({ error: FOLLOW_UP_PHONE_REQUIRED_ERROR });
    }

    const created = await Visitor.insertMany(
      people.map((visitor, index) => ({
        churchId: access.churchId,
        name: visitor.name,
        relationship: visitor.relationship,
        city: visitor.city,
        panelObservation: visitor.panelObservation,
        showObservationOnPanel: visitor.showObservationOnPanel,
        visitKind: visitor.visitKind,
        visitDate: new Date(),
        source: 'guest_access' as const,
        guestAccess,
        ...(serviceId ? { serviceId } : {}),
        ...(index === 0 && requestId ? { requestId } : {}),
      }))
    );

    if (contactConsent) {
      const next = resolveNextContactAt('tomorrow', undefined, new Date(), access.timezone || CHURCH_TIMEZONE);
      for (const visitor of created) {
        await createFollowUpRecord({
          churchId: access.churchId,
          visitorId: visitor._id,
          phone,
          nextContactAt: next.date,
          consent: true,
          source: 'guest_access',
        });
      }
    }

    await markGuestAccessUsed(access).catch(() => undefined);
    await recordPublicEvent(req, 'submitted').catch(() => undefined);
    return res.status(201).json({ success: true, message: 'Informações enviadas' });
  } catch (error) {
    if (isDuplicateKey(error)) {
      return res.status(201).json({ success: true, message: 'Informações enviadas' });
    }
    return res.status(500).json({ error: 'Não foi possível registrar os visitantes.' });
  }
}

export async function createPublicPrayerRequest(req: GuestAccessRequest, res: Response) {
  try {
    if (rejectsClientChurchId(req.body)) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    }
    if (rejectsClientServiceId(req.body)) {
      return res.status(400).json({ error: 'O culto não pode ser escolhido neste envio.' });
    }

    const body =
      req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const isAnonymous = body.isAnonymous === true;
    const name = isAnonymous ? '' : normalizeSingleLine(body.name, 120);
    const request = typeof body.request === 'string' ? body.request.trim() : '';
    const requestId = parseRequestId(body.requestId);

    if ((!isAnonymous && !name) || !request || request.length > 2000) {
      return res.status(400).json({
        error: 'Revise o nome e o pedido de oração antes de enviar.',
      });
    }

    const access = req.guestAccess!;
    const churchId = new Types.ObjectId(access.churchId);
    const guestAccessId = new Types.ObjectId(access.guestAccessId);

    if (requestId) {
      const replayed = await PrayerRequest.exists({ churchId, requestId });
      if (replayed) {
        return res.status(201).json({ success: true, message: 'Informações enviadas' });
      }
    }

    const recentDuplicate = await PrayerRequest.exists({
      churchId,
      'guestAccess.guestAccessId': guestAccessId,
      request,
      createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    });
    if (recentDuplicate) {
      return res.status(201).json({ success: true, message: 'Informações enviadas' });
    }

    const serviceId = await activeServiceId(access.churchId);

    await PrayerRequest.create({
      churchId: access.churchId,
      name,
      request,
      source: 'guest_access',
      isAnonymous,
      allowProjection: body.allowProjection === true,
      requestId,
      serviceId,
      guestAccess: {
        guestAccessId: access.guestAccessId,
        name: access.accessName,
        type: access.scope,
      },
    });

    await markGuestAccessUsed(access).catch(() => undefined);
    await recordPublicEvent(req, 'submitted').catch(() => undefined);
    return res.status(201).json({ success: true, message: 'Informações enviadas' });
  } catch (error) {
    if (isDuplicateKey(error)) {
      return res.status(201).json({ success: true, message: 'Informações enviadas' });
    }
    return res.status(500).json({ error: 'Não foi possível enviar o pedido de oração.' });
  }
}

router.post(
  '/:token/visitors',
  requireGuestAccess('visitors:create'),
  createPublicVisitors
);

router.post(
  '/:token/prayer-requests',
  requireGuestAccess('prayers:create'),
  createPublicPrayerRequest
);

export async function createPublicVehicleNotice(req: GuestAccessRequest, res: Response) {
  try {
    if (rejectsClientChurchId(req.body)) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    }
    if (rejectsClientServiceId(req.body)) {
      return res.status(400).json({ error: 'O culto não pode ser escolhido neste envio.' });
    }

    const body =
      req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};

    const plate = parseVehiclePlate(body.plate);
    if (!plate) {
      return res.status(400).json({ error: 'Confira a placa do veículo.' });
    }

    const vehicleModel = normalizeSingleLine(body.vehicleModel, 120);
    const requestedAction = body.requestedAction;
    const otherDescription =
      typeof body.otherDescription === 'string'
        ? body.otherDescription.trim().replace(/\s+/g, ' ').slice(0, MAX_OTHER_DESCRIPTION)
        : '';
    const detailsRaw = typeof body.details === 'string' ? body.details.trim() : '';
    const details = detailsRaw.slice(0, MAX_DETAILS_LENGTH);
    const requestId = parseRequestId(body.requestId);

    if (!vehicleModel || !isVehicleNoticeAction(requestedAction)) {
      return res.status(400).json({ error: 'Revise o modelo e a ação solicitada.' });
    }

    if (requestedAction === 'other' && !otherDescription) {
      return res.status(400).json({ error: 'Descreva o que precisa ser feito.' });
    }

    if (detailsRaw.length > MAX_DETAILS_LENGTH) {
      return res.status(400).json({ error: 'A observação está muito longa.' });
    }

    const access = req.guestAccess!;
    const churchId = new Types.ObjectId(access.churchId);
    const guestAccessId = new Types.ObjectId(access.guestAccessId);

    if (requestId) {
      const replayed = await VehicleNotice.exists({ churchId, requestId });
      if (replayed) {
        return res.status(201).json({ success: true, message: 'Aviso enviado' });
      }
    }

    const recentDuplicate = await VehicleNotice.exists({
      churchId,
      guestAccessId,
      plateNormalized: plate.plateNormalized,
      requestedAction,
      vehicleModel,
      createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    });
    if (recentDuplicate) {
      return res.status(201).json({ success: true, message: 'Aviso enviado' });
    }

    const serviceId = await activeServiceId(access.churchId);

    await VehicleNotice.create({
      churchId,
      guestAccessId,
      plate: plate.plate,
      plateNormalized: plate.plateNormalized,
      vehicleModel,
      requestedAction,
      otherDescription,
      details,
      requestId,
      serviceId,
      status: 'pending',
      source: 'guest_access',
      guestAccess: {
        guestAccessId: access.guestAccessId,
        name: access.accessName,
        type: access.scope,
      },
      archived: false,
    });

    await markGuestAccessUsed(access).catch(() => undefined);
    await recordPublicEvent(req, 'submitted').catch(() => undefined);
    return res.status(201).json({ success: true, message: 'Aviso enviado' });
  } catch (error) {
    if (isDuplicateKey(error)) {
      return res.status(201).json({ success: true, message: 'Aviso enviado' });
    }
    return res.status(500).json({ error: 'Não foi possível enviar o aviso.' });
  }
}

router.post(
  '/:token/vehicle-notices',
  requireGuestAccess('vehicle_notices:create'),
  createPublicVehicleNotice
);

/**
 * Painéis de TV pelo link de leitura. Só leem, sempre na igreja do token, e
 * reusam os mesmos recortes do painel com login (services/panelData.ts).
 */
function panelRoute(
  path: string,
  load: (churchId: string, date: Date) => Promise<unknown>
) {
  router.get(
    `/:token/panels/${path}`,
    requireGuestAccess('panels:read'),
    async (req: GuestAccessRequest, res: Response) => {
      try {
        const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
        const date = dateParam ? parseDateOnly(dateParam) : new Date();
        if (!date) {
          return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
        }

        return res.json(await load(req.guestAccess!.churchId, date));
      } catch {
        return res.status(500).json({ error: 'Não foi possível carregar o painel agora.' });
      }
    }
  );
}

panelRoute('visitors', fetchVisitorPanel);
panelRoute('prayers', fetchPrayerPanel);
panelRoute('hymns', fetchHymnPanel);
panelRoute('vehicle-notices', (churchId) => fetchVehicleNoticePanel(churchId));
panelRoute('worship', async (churchId) => fetchWorshipPanel(churchId));

export default router;
