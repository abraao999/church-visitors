import { Router, type Response } from 'express';
import {
  markGuestAccessUsed,
  requireGuestAccess,
  type GuestAccessRequest,
} from '../middleware/guestAccess.js';
import { PrayerRequest } from '../models/PrayerRequest.js';
import { Visitor, RELATIONSHIPS } from '../models/Visitor.js';
import type { Relationship } from '../constants/relationships.js';

const router = Router();
const MAX_VISITORS_PER_REQUEST = 10;

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
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

export default router;
