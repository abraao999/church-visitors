import { Router, Response } from 'express';
import { Visitor, RELATIONSHIPS } from '../models/Visitor.js';
import type { Relationship } from '../constants/relationships.js';
import {
  requireAuth,
  toActor,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { requireAnyPermission, requirePermission } from '../middleware/requirePermission.js';
import { resolveLinkedServiceId } from '../services/activeService.js';
import { fetchVisitorPanel } from '../services/panelData.js';
import { hasPermission } from '../utils/permissions.js';
import { endOfDay, parseDateOnly, startOfDay } from '../utils/dayRange.js';
import {
  sendPrivateJson,
  serializeVisitor,
  setPrivateCacheHeaders,
  VISITOR_LIST_FIELDS,
} from '../utils/publicRecord.js';
import { tenantRecordFilter, withChurch } from '../utils/tenant.js';

const router = Router();

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

export async function countVisitors(req: AuthenticatedRequest, res: Response) {
  try {
    const dateParam = req.query.date as string | undefined;
    const date = dateParam ? parseDateOnly(dateParam) : new Date();

    if (!date) {
      return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
    }

    const count = await Visitor.countDocuments(
      withChurch(req.auth!.churchId, {
        visitDate: { $gte: startOfDay(date), $lte: endOfDay(date) },
      })
    );

    return sendPrivateJson(res, { count });
  } catch {
    res.status(500).json({ error: 'Erro ao contar visitantes' });
  }
}

export async function listVisitors(req: AuthenticatedRequest, res: Response) {
  try {
    const dateParam = req.query.date as string | undefined;
    const date = dateParam ? parseDateOnly(dateParam) : new Date();

    if (!date) {
      return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
    }

    const visitors = await Visitor.find(
      withChurch(req.auth!.churchId, {
        visitDate: { $gte: startOfDay(date), $lte: endOfDay(date) },
      })
    )
      .select(VISITOR_LIST_FIELDS)
      .sort({ createdAt: -1 });

    return sendPrivateJson(res, visitors.map(serializeVisitor));
  } catch {
    res.status(500).json({ error: 'Erro ao buscar visitantes' });
  }
}

/** Painel de TV: só nome, cidade e horário. Sem parentesco nem quem registrou. */
export async function listVisitorsPanel(req: AuthenticatedRequest, res: Response) {
  try {
    const dateParam = req.query.date as string | undefined;
    const date = dateParam ? parseDateOnly(dateParam) : new Date();

    if (!date) {
      return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
    }

    setPrivateCacheHeaders(res);
    res.json(await fetchVisitorPanel(req.auth!.churchId, date));
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
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const linked = await resolveLinkedServiceId(req.auth!.churchId, body.serviceId, {
      allowChoose: hasPermission(req.auth!.permissions, 'services:read'),
    });
    if (linked.error) {
      return res.status(400).json({ error: linked.error });
    }
    const created = await Visitor.insertMany(
      normalized.data.map((person) => ({
        churchId: req.auth!.churchId,
        name: person.name,
        relationship: person.relationship,
        city: person.city,
        visitDate,
        source: 'owner',
        createdBy,
        ...(linked.serviceId ? { serviceId: linked.serviceId } : {}),
      }))
    );

    const payload = created.map(serializeVisitor);
    return sendPrivateJson(res, payload.length === 1 ? payload[0] : payload, 201);
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

router.get('/', requireAuth, requirePermission('visitors:read'), listVisitors);
router.get('/stats', requireAuth, requirePermission('visitors:read'), countVisitors);
router.get('/panel', requireAuth, requireAnyPermission('panels:open', 'visitors:read'), listVisitorsPanel);
router.post('/', requireAuth, requirePermission('visitors:create'), createVisitors);
router.delete('/:id', requireAuth, requirePermission('visitors:delete'), deleteVisitor);

export default router;
