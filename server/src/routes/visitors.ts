import { Router, Response } from 'express';
import { Visitor, RELATIONSHIPS } from '../models/Visitor.js';
import type { Relationship } from '../constants/relationships.js';
import {
  requireAuth,
  toActor,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { requireAnyPermission, requirePermission } from '../middleware/requirePermission.js';
import { Church } from '../models/Church.js';
import { resolveLinkedServiceId } from '../services/activeService.js';
import { fetchVisitorPanel } from '../services/panelData.js';
import { createFollowUpRecord, removeFollowUpForVisitor } from '../services/visitorFollowUp.js';
import { hasPermission } from '../utils/permissions.js';
import { CHURCH_TIMEZONE, endOfDay, parseDateOnly, startOfDay } from '../utils/dayRange.js';
import {
  sendPrivateJson,
  serializeVisitor,
  setPrivateCacheHeaders,
  VISITOR_LIST_FIELDS,
} from '../utils/publicRecord.js';
import { tenantRecordFilter, withChurch } from '../utils/tenant.js';
import { normalizePanelObservation, readShowObservationOnPanel } from '../utils/panelText.js';
import { parseVisitKind } from '../utils/reportRange.js';
import {
  FOLLOW_UP_DISABLED_ERROR,
  FOLLOW_UP_FORBIDDEN_ERROR,
  isValidFollowUpPhone,
  normalizeFollowUpPhone,
  resolveNextContactAt,
} from '../utils/visitorFollowUp.js';

const router = Router();

function isRelationship(value: string): value is Relationship {
  return RELATIONSHIPS.includes(value as Relationship);
}

type FollowUpDraft = {
  include: boolean;
  phone: string;
  assignedToId?: unknown;
  firstContact?: unknown;
  firstContactDate?: unknown;
};

type VisitorInput = {
  name: string;
  relationship: Relationship;
  city: string;
  panelObservation: string;
  showObservationOnPanel: boolean;
  visitKind: 'first' | 'returning' | 'unknown';
  followUp?: FollowUpDraft;
};

const MAX_VISITORS_PER_REQUEST = 10;

function parseVisitorFollowUpDraft(raw: unknown): FollowUpDraft | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  if (value.include !== true) return undefined;
  return {
    include: true,
    phone: typeof value.phone === 'string' ? value.phone : '',
    assignedToId: value.assignedToId,
    firstContact: value.firstContact,
    firstContactDate: value.firstContactDate,
  };
}

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
    data.push({
      name,
      relationship,
      city,
      panelObservation: normalizePanelObservation(raw.panelObservation),
      showObservationOnPanel: readShowObservationOnPanel(raw.showObservationOnPanel),
      visitKind: parseVisitKind(raw.visitKind),
      followUp: parseVisitorFollowUpDraft(raw.followUp),
    });
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
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const visitDate =
      typeof body.visitDate === 'string' && body.visitDate
        ? parseDateOnly(body.visitDate)
        : new Date();
    if (!visitDate) {
      return res.status(400).json({ error: 'Informe uma data de visita válida.' });
    }

    const followUps = normalized.data
      .map((person, index) => ({ person, index }))
      .filter((entry) => entry.person.followUp?.include === true);

    let timezone = CHURCH_TIMEZONE;
    if (followUps.length > 0) {
      if (!hasPermission(req.auth!.permissions, 'follow_up:create')) {
        return res.status(403).json({ error: FOLLOW_UP_FORBIDDEN_ERROR });
      }
      const church = await Church.findById(req.auth!.churchId).select(
        'visitorFollowUpEnabled timezone active'
      );
      if (!church || church.active === false || church.visitorFollowUpEnabled !== true) {
        return res.status(403).json({ error: FOLLOW_UP_DISABLED_ERROR });
      }
      timezone = church.timezone || CHURCH_TIMEZONE;
      for (const entry of followUps) {
        const phone = normalizeFollowUpPhone(entry.person.followUp?.phone);
        if (entry.person.followUp?.phone?.trim() && !isValidFollowUpPhone(phone)) {
          return res.status(400).json({ error: 'Informe um telefone válido com DDD.' });
        }
        const next = resolveNextContactAt(
          entry.person.followUp?.firstContact,
          entry.person.followUp?.firstContactDate,
          new Date(),
          timezone
        );
        if (next.error) {
          return res.status(400).json({ error: next.error });
        }
      }
    }

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
        panelObservation: person.panelObservation,
        showObservationOnPanel: person.showObservationOnPanel,
        visitKind: person.visitKind,
        visitDate,
        source: 'owner',
        createdBy,
        ...(linked.serviceId ? { serviceId: linked.serviceId } : {}),
      }))
    );

    if (followUps.length > 0) {
      for (const entry of followUps) {
        const person = created[entry.index];
        if (!person) continue;
        const next = resolveNextContactAt(
          entry.person.followUp?.firstContact,
          entry.person.followUp?.firstContactDate,
          new Date(),
          timezone
        );
        await createFollowUpRecord({
          churchId: req.auth!.churchId,
          visitorId: person._id,
          phone: entry.person.followUp?.phone,
          assignedToId: entry.person.followUp?.assignedToId,
          nextContactAt: next.date,
          consent: true,
          source: 'owner',
          createdBy,
        });
      }
    }

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
    await removeFollowUpForVisitor(req.auth!.churchId, deleted._id);
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
