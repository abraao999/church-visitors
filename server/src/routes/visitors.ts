import { Router, Response } from 'express';
import { Visitor, RELATIONSHIPS } from '../models/Visitor.js';
import type { Relationship } from '../constants/relationships.js';
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

function isRelationship(value: string): value is Relationship {
  return RELATIONSHIPS.includes(value as Relationship);
}

type VisitorInput = {
  name: string;
  relationship: Relationship;
  city: string;
};

const MAX_VISITORS_PER_REQUEST = 10;

function normalizeVisitors(body: Record<string, unknown>): { data: VisitorInput[]; error?: string } {
  const rawList = Array.isArray(body.visitors)
    ? body.visitors
    : body.name != null
      ? [{ name: body.name, relationship: body.relationship, city: body.city }]
      : [];

  if (rawList.length === 0 || rawList.length > MAX_VISITORS_PER_REQUEST) {
    return { data: [], error: `Informe de 1 a ${MAX_VISITORS_PER_REQUEST} visitantes por cadastro` };
  }

  const data: VisitorInput[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') {
      return { data: [], error: 'Revise os dados de cada visitante' };
    }

    const raw = item as Record<string, unknown>;
    if (typeof raw.name !== 'string' || typeof raw.city !== 'string') {
      return { data: [], error: 'Informe o nome e a cidade de cada visitante' };
    }

    const name = raw.name.trim().replace(/\s+/g, ' ');
    const city = raw.city.trim().replace(/\s+/g, ' ');
    const relationshipRaw = typeof raw.relationship === 'string' ? raw.relationship : 'outro';
    const relationship = isRelationship(relationshipRaw) ? relationshipRaw : null;

    if (!name || name.length > 120 || !city || city.length > 100 || !relationship) {
      return { data: [], error: 'Informe o nome e a cidade de cada visitante' };
    }
    data.push({ name, relationship, city });
  }

  return { data };
}

export async function listVisitors(req: AuthenticatedRequest, res: Response) {
  try {
    const dateParam = req.query.date as string | undefined;
    const date = dateParam ? parseDateOnly(dateParam) : new Date();

    if (!date) {
      return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
    }

    const visitors = await Visitor.find(withChurch(req.auth!.churchId, {
      visitDate: { $gte: startOfDay(date), $lte: endOfDay(date) },
    })).sort({ createdAt: -1 });

    res.json(visitors);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar visitantes' });
  }
}

export async function createVisitors(req: AuthenticatedRequest, res: Response) {
  try {
    const normalized = normalizeVisitors(req.body);

    if (normalized.error) {
      return res.status(400).json({ error: normalized.error });
    }

    const createdBy = toActor(req.auth!);
    const visitDate = new Date();
    const created = await Visitor.insertMany(
      normalized.data.map((person) => ({
        churchId: req.auth!.churchId,
        name: person.name,
        relationship: person.relationship,
        city: person.city,
        visitDate,
        source: 'owner',
        createdBy,
      }))
    );

    res.status(201).json(created.length === 1 ? created[0] : created);
  } catch {
    res.status(500).json({ error: 'Erro ao registrar visitante' });
  }
}

export async function deleteVisitor(req: AuthenticatedRequest, res: Response) {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) {
      return res.status(404).json({ error: 'Visitante não encontrado' });
    }

    const deleted = await Visitor.findOneAndDelete(filter);
    if (!deleted) {
      return res.status(404).json({ error: 'Visitante não encontrado' });
    }
    res.json({ message: 'Visitante removido' });
  } catch {
    res.status(500).json({ error: 'Erro ao remover visitante' });
  }
}

router.get('/', requireAuth, listVisitors);
router.post('/', requireAuth, createVisitors);
router.delete('/:id', requireAuth, deleteVisitor);

export default router;
