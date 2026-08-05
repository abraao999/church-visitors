import { Router, Response } from 'express';
import { PrayerRequest } from '../models/PrayerRequest.js';
import {
  requireAuth,
  requireAuthUnlessLive,
  toActor,
  type AuthenticatedRequest,
} from '../middleware/auth.js';

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

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dateParam = req.query.date as string | undefined;
    const date = dateParam ? parseDateOnly(dateParam) : new Date();

    if (!date) {
      return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
    }

    const requests = await PrayerRequest.find({
      createdAt: { $gte: startOfDay(date), $lte: endOfDay(date) },
    }).sort({ createdAt: -1 });

    res.json(requests);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar pedidos de oração' });
  }
});

router.post('/', requireAuthUnlessLive, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, request, source, isAnonymous } = req.body;

    if (!request?.trim()) {
      return res.status(400).json({ error: 'O pedido de oração é obrigatório' });
    }

    const validSources = ['porteiro', 'live'];
    if (!validSources.includes(source)) {
      return res.status(400).json({ error: 'Origem inválida' });
    }

    const anonymous = Boolean(isAnonymous);
    if (!anonymous && !name?.trim()) {
      return res.status(400).json({ error: 'Informe o nome ou marque como anônimo' });
    }

    const prayerRequest = await PrayerRequest.create({
      name: anonymous ? '' : name.trim(),
      request: request.trim(),
      source,
      isAnonymous: anonymous,
      ...(source !== 'live' && req.user ? { createdBy: toActor(req.user) } : {}),
    });

    res.status(201).json(prayerRequest);
  } catch {
    res.status(500).json({ error: 'Erro ao registrar pedido de oração' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = await PrayerRequest.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }
    res.json({ message: 'Pedido removido' });
  } catch {
    res.status(500).json({ error: 'Erro ao remover pedido' });
  }
});

export default router;
