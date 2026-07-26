import { Router, Request, Response } from 'express';
import { PrayerRequest } from '../models/PrayerRequest.js';

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

router.get('/', async (req: Request, res: Response) => {
  try {
    const dateParam = req.query.date as string | undefined;
    const date = dateParam ? new Date(dateParam) : new Date();

    const requests = await PrayerRequest.find({
      createdAt: { $gte: startOfDay(date), $lte: endOfDay(date) },
    }).sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar pedidos de oração' });
  }
});

router.post('/', async (req: Request, res: Response) => {
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
    });

    res.status(201).json(prayerRequest);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao registrar pedido de oração' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await PrayerRequest.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }
    res.json({ message: 'Pedido removido' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover pedido' });
  }
});

export default router;
