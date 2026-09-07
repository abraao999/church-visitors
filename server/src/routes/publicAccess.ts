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
import { parseVehiclePlate } from '../utils/vehiclePlate.js';
import { Types } from 'mongoose';

const router = Router();
const MAX_VISITORS_PER_REQUEST = 10;
const MAX_DETAILS_LENGTH = 500;
const MAX_OTHER_DESCRIPTION = 240;
const DUPLICATE_WINDOW_MS = 20_000;

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
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

router.get('/:token', requireGuestAccess(), (req: GuestAccessRequest, res: Response) => {
  const access = req.guestAccess!;
  res.json({
    valid: true,
    churchName: access.churchName,
    accessName: access.accessName,
    type: access.scope,
    types: access.scopes,
  });
});

router.post(
  '/:token/visitors',
  requireGuestAccess('visitors:create'),
  async (req: GuestAccessRequest, res: Response) => {
    try {
      if (rejectsClientChurchId(req.body)) {
        return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
      }

      const rawVisitors = req.body?.visitors;
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
        if (!raw || typeof raw !== 'object' || 'churchId' in raw) return null;
        const item = raw as Record<string, unknown>;
        const name = normalizeSingleLine(item.name, 120);
        const city = normalizeSingleLine(item.city, 100);
        const relationshipRaw = typeof item.relationship === 'string' ? item.relationship : 'outro';
        if (!name || !city || !isRelationship(relationshipRaw)) return null;
        return { name, city, relationship: relationshipRaw };
      });

      if (visitors.some((visitor) => visitor === null)) {
        return res.status(400).json({
          error: 'Informe o nome e a cidade de cada visitante.',
        });
      }

      const access = req.guestAccess!;
      const guestAccess = {
        guestAccessId: access.guestAccessId,
        name: access.accessName,
        type: access.scope,
      };

      await Visitor.insertMany(
        visitors.map((visitor) => ({
          churchId: access.churchId,
          name: visitor!.name,
          relationship: visitor!.relationship,
          city: visitor!.city,
          visitDate: new Date(),
          source: 'guest_access',
          guestAccess,
        }))
      );

      await markGuestAccessUsed(access).catch(() => undefined);
      return res.status(201).json({ success: true, message: 'Informações enviadas' });
    } catch {
      return res.status(500).json({ error: 'Não foi possível registrar os visitantes.' });
    }
  }
);

router.post(
  '/:token/prayer-requests',
  requireGuestAccess('prayers:create'),
  async (req: GuestAccessRequest, res: Response) => {
    try {
      if (rejectsClientChurchId(req.body)) {
        return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
      }

      const body = req.body && typeof req.body === 'object'
        ? (req.body as Record<string, unknown>)
        : {};
      const isAnonymous = body.isAnonymous === true;
      const name = isAnonymous ? '' : normalizeSingleLine(body.name, 120);
      const request = typeof body.request === 'string' ? body.request.trim() : '';

      if ((!isAnonymous && !name) || !request || request.length > 2000) {
        return res.status(400).json({
          error: 'Revise o nome e o pedido de oração antes de enviar.',
        });
      }

      const access = req.guestAccess!;
      await PrayerRequest.create({
        churchId: access.churchId,
        name,
        request,
        source: 'guest_access',
        isAnonymous,
        guestAccess: {
          guestAccessId: access.guestAccessId,
          name: access.accessName,
          type: access.scope,
        },
      });

      await markGuestAccessUsed(access).catch(() => undefined);
      return res.status(201).json({ success: true, message: 'Informações enviadas' });
    } catch {
      return res.status(500).json({ error: 'Não foi possível enviar o pedido de oração.' });
    }
  }
);

function parseRequestId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const requestId = value.trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) return undefined;
  return requestId;
}

export async function createPublicVehicleNotice(req: GuestAccessRequest, res: Response) {
  try {
    if (rejectsClientChurchId(req.body)) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
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
    return res.status(201).json({ success: true, message: 'Aviso enviado' });
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined;
    if (code === 11000) {
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

export default router;
