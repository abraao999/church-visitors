import { Router, Response } from 'express';
import { Visitor, RELATIONSHIPS } from '../models/Visitor.js';
import type { Relationship } from '../constants/relationships.js';
import {
  requireAuth,
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

function isRelationship(value: string): value is Relationship {
  return RELATIONSHIPS.includes(value as Relationship);
}

type VisitorInput = {
  name: string;
  relationship: Relationship;
  city: string;
};

function normalizeVisitors(body: Record<string, unknown>): VisitorInput[] {
  const rawList = Array.isArray(body.visitors)
    ? body.visitors
    : body.name != null
      ? [{ name: body.name, relationship: body.relationship, city: body.city }]
      : [];

  return rawList
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = String((item as { name?: unknown }).name ?? '').trim();
      const relationship = String((item as { relationship?: unknown }).relationship ?? '');
      const city = String((item as { city?: unknown }).city ?? '').trim();

      if (!name || !city || !isRelationship(relationship)) return null;
      return { name, relationship, city };
    })
    .filter((item): item is VisitorInput => item !== null);
}

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dateParam = req.query.date as string | undefined;
    const date = dateParam ? parseDateOnly(dateParam) : new Date();

    if (!date) {
      return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
    }

    const visitors = await Visitor.find({
      visitDate: { $gte: startOfDay(date), $lte: endOfDay(date) },
    }).sort({ createdAt: -1 });

    res.json(visitors);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar visitantes' });
  }
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const people = normalizeVisitors(req.body);

    if (people.length === 0) {
      return res.status(400).json({
        error: 'Informe ao menos um visitante com nome, parentesco e cidade',
      });
    }

    const createdBy = toActor(req.user!);
    const visitDate = req.body.visitDate ? new Date(req.body.visitDate) : new Date();
    const created = await Visitor.insertMany(
      people.map((person) => ({
        name: person.name,
        relationship: person.relationship,
        city: person.city,
        visitDate,
        createdBy,
      }))
    );

    res.status(201).json(created.length === 1 ? created[0] : created);
  } catch {
    res.status(500).json({ error: 'Erro ao registrar visitante' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = await Visitor.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Visitante não encontrado' });
    }
    res.json({ message: 'Visitante removido' });
  } catch {
    res.status(500).json({ error: 'Erro ao remover visitante' });
  }
});

export default router;
