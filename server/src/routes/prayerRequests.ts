import { Router, Response } from 'express';
import { PrayerRequest } from '../models/PrayerRequest.js';
import {
  requireAuth,
  toActor,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { tenantRecordFilter, withChurch } from '../utils/tenant.js';

const router = Router();

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function listPrayerRequests(req: AuthenticatedRequest, res: Response) {
  try {
    const dateParam = req.query.date as string | undefined;
    const date = dateParam ? parseDateOnly(dateParam) : new Date();

    if (!date) {
      return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
    }

    const requests = await PrayerRequest.find(withChurch(req.auth!.churchId, {
      createdAt: { $gte: startOfDay(date), $lte: endOfDay(date) },
    })).sort({ createdAt: -1 });

    res.json(requests);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar pedidos de oração' });
  }
}

export async function createPrayerRequest(req: AuthenticatedRequest, res: Response) {
  try {
    const body = req.body && typeof req.body === 'object'
      ? (req.body as Record<string, unknown>)
      : {};
    const request = typeof body.request === 'string' ? body.request.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';

    if (!request || request.length > 2000) {
      return res.status(400).json({ error: 'O pedido de oração é obrigatório' });
    }

    const anonymous = body.isAnonymous === true;
    if (!anonymous && (!name || name.length > 120)) {
      return res.status(400).json({ error: 'Informe o nome ou marque como anônimo' });
    }

    const prayerRequest = await PrayerRequest.create({
      churchId: req.auth!.churchId,
      name: anonymous ? '' : name,
      request,
      source: 'owner',
      isAnonymous: anonymous,
      createdBy: toActor(req.auth!),
    });

    res.status(201).json(prayerRequest);
  } catch {
    res.status(500).json({ error: 'Erro ao registrar pedido de oração' });
  }
}

export async function deletePrayerRequest(req: AuthenticatedRequest, res: Response) {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const deleted = await PrayerRequest.findOneAndDelete(filter);
    if (!deleted) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }
    res.json({ message: 'Pedido removido' });
  } catch {
    res.status(500).json({ error: 'Erro ao remover pedido' });
  }
}

router.get('/', requireAuth, listPrayerRequests);
router.post('/', requireAuth, createPrayerRequest);
router.delete('/:id', requireAuth, deletePrayerRequest);

export default router;
