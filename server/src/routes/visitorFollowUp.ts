import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission, requirePermission } from '../middleware/requirePermission.js';
import { FollowUpContact } from '../models/FollowUpContact.js';
import { Visitor } from '../models/Visitor.js';
import { VisitorFollowUp } from '../models/VisitorFollowUp.js';
import {
  actorFromRequest,
  assertFollowUpEnabled,
  createFollowUpRecord,
  listAssignees,
  parseContactBody,
  parseCreateFollowUpBody,
  resolveAssignee,
  searchAvailableVisitors,
  serializeFollowUp,
} from '../services/visitorFollowUp.js';
import { CHURCH_TIMEZONE, endOfDay, startOfDay } from '../utils/dayRange.js';
import { hasPermission } from '../utils/permissions.js';
import { sendPrivateJson } from '../utils/publicRecord.js';
import { tenantRecordFilter, withChurch } from '../utils/tenant.js';
import {
  FOLLOW_UP_FORBIDDEN_ERROR,
  escapeSearch,
  sanitizeSearch,
} from '../utils/visitorFollowUp.js';

const router = Router();

async function withEnabledFollowUp(req: AuthenticatedRequest, res: Response) {
  const enabled = await assertFollowUpEnabled(req.auth!.churchId);
  if ('error' in enabled && enabled.error) {
    res.status(enabled.status).json({ error: enabled.error });
    return null;
  }
  return { timezone: enabled.timezone || CHURCH_TIMEZONE };
}

function rejectsClientChurchId(body: unknown) {
  return Boolean(body && typeof body === 'object' && 'churchId' in body);
}

export async function listFollowUps(req: AuthenticatedRequest, res: Response) {
  try {
    const enabled = await withEnabledFollowUp(req, res);
    if (!enabled) return;

    const churchId = req.auth!.churchId;
    const includePhone = hasPermission(req.auth!.permissions, 'follow_up:read');
    const filter: Record<string, unknown> = { anonymizedAt: { $exists: false } };
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'all';
    const now = new Date();

    if (statusFilter === 'awaiting') {
      filter.status = 'awaiting';
    } else if (statusFilter === 'integrating') {
      filter.status = 'integrating';
    } else if (statusFilter === 'today') {
      filter.status = { $ne: 'closed' };
      filter.nextContactAt = { $gte: startOfDay(now, enabled.timezone), $lte: endOfDay(now, enabled.timezone) };
    } else {
      filter.status = { $ne: 'closed' };
    }

    const q = sanitizeSearch(req.query.q);
    if (q) {
      const matches = await Visitor.find(
        withChurch(churchId, {
          name: { $regex: escapeSearch(q), $options: 'i' },
          anonymizedAt: { $exists: false },
        })
      ).select('_id');
      filter.visitorId = { $in: matches.map((item) => item._id) };
    }

    const [items, awaiting, today, integrating] = await Promise.all([
      VisitorFollowUp.find(withChurch(churchId, filter)).sort({
        nextContactAt: 1,
        createdAt: -1,
      }),
      VisitorFollowUp.countDocuments(withChurch(churchId, { status: 'awaiting', anonymizedAt: { $exists: false } })),
      VisitorFollowUp.countDocuments(
        withChurch(churchId, {
          status: { $ne: 'closed' },
          anonymizedAt: { $exists: false },
          nextContactAt: { $gte: startOfDay(now, enabled.timezone), $lte: endOfDay(now, enabled.timezone) },
        })
      ),
      VisitorFollowUp.countDocuments(
        withChurch(churchId, { status: 'integrating', anonymizedAt: { $exists: false } })
      ),
    ]);

    const visitorIds = items.map((item) => item.visitorId);
    const visitors = visitorIds.length
      ? await Visitor.find(withChurch(churchId, { _id: { $in: visitorIds } })).select(
          'name city visitDate'
        )
      : [];
    const visitorsById = new Map(visitors.map((visitor) => [String(visitor._id), visitor]));

    return sendPrivateJson(res, {
      summary: { awaiting, today, integrating },
      items: items.map((item) =>
        serializeFollowUp(item, visitorsById.get(String(item.visitorId)), {
          includePhone,
          timeZone: enabled.timezone,
        })
      ),
    });
  } catch {
    return res.status(500).json({ error: 'Não foi possível carregar o acompanhamento.' });
  }
}

export async function listFollowUpAssignees(req: AuthenticatedRequest, res: Response) {
  try {
    const enabled = await withEnabledFollowUp(req, res);
    if (!enabled) return;
    return sendPrivateJson(res, await listAssignees(req.auth!.churchId));
  } catch {
    return res.status(500).json({ error: 'Não foi possível carregar os responsáveis.' });
  }
}

export async function listAvailableFollowUpVisitors(req: AuthenticatedRequest, res: Response) {
  try {
    const enabled = await withEnabledFollowUp(req, res);
    if (!enabled) return;
    return sendPrivateJson(res, await searchAvailableVisitors(req.auth!.churchId, req.query.q));
  } catch {
    return res.status(500).json({ error: 'Não foi possível buscar os visitantes.' });
  }
}

export async function createFollowUp(req: AuthenticatedRequest, res: Response) {
  try {
    if (rejectsClientChurchId(req.body)) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    }
    const enabled = await withEnabledFollowUp(req, res);
    if (!enabled) return;

    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const visitorId = typeof body.visitorId === 'string' ? body.visitorId : '';
    if (!visitorId) {
      return res.status(400).json({ error: 'Escolha um visitante desta igreja.' });
    }
    const parsed = parseCreateFollowUpBody(body, new Date(), enabled.timezone);
    if ('error' in parsed && parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    if (!('phone' in parsed)) {
      return res.status(400).json({ error: 'Revise os dados do acompanhamento.' });
    }

    const created = await createFollowUpRecord({
      churchId: req.auth!.churchId,
      visitorId,
      phone: parsed.phone,
      assignedToId: parsed.assignedToId,
      nextContactAt: parsed.nextContactAt,
      consent: true,
      source: 'owner',
      createdBy: actorFromRequest(req),
    });
    if ('error' in created && created.error) {
      return res.status(created.status ?? 400).json({ error: created.error });
    }

    const visitorFilter = tenantRecordFilter(req.auth!.churchId, created.followUp!.visitorId);
    const visitor = visitorFilter
      ? await Visitor.findOne(visitorFilter).select('name city visitDate')
      : null;
    return sendPrivateJson(
      res,
      serializeFollowUp(created.followUp!, visitor || undefined, {
        includePhone: true,
        timeZone: enabled.timezone,
      }),
      201
    );
  } catch {
    return res.status(500).json({ error: 'Não foi possível criar o acompanhamento.' });
  }
}

export async function getFollowUp(req: AuthenticatedRequest, res: Response) {
  try {
    const enabled = await withEnabledFollowUp(req, res);
    if (!enabled) return;
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) {
      return res.status(404).json({ error: 'Acompanhamento não encontrado.' });
    }
    const item = await VisitorFollowUp.findOne(filter);
    if (!item || item.anonymizedAt) {
      return res.status(404).json({ error: 'Acompanhamento não encontrado.' });
    }
    const visitorPreviewFilter = tenantRecordFilter(req.auth!.churchId, item.visitorId);
    const visitor = visitorPreviewFilter
      ? await Visitor.findOne(visitorPreviewFilter).select('name city visitDate')
      : null;
    const contacts = await FollowUpContact.find(
      withChurch(req.auth!.churchId, { followUpId: item._id })
    ).sort({ createdAt: -1 });

    return sendPrivateJson(res, {
      followUp: serializeFollowUp(item, visitor || undefined, {
        includePhone: hasPermission(req.auth!.permissions, 'follow_up:read'),
        timeZone: enabled.timezone,
      }),
      contacts: contacts.map((contact) => ({
        id: String(contact._id),
        contactedAt: contact.contactedAt,
        type: contact.type,
        result: contact.result,
        note: contact.note || undefined,
        nextContactAt: contact.nextContactAt,
        status: contact.status,
        createdBy: contact.createdBy?.name ? { name: contact.createdBy.name } : undefined,
        createdAt: contact.createdAt,
      })),
    });
  } catch {
    return res.status(500).json({ error: 'Não foi possível carregar o histórico.' });
  }
}

export async function patchFollowUp(req: AuthenticatedRequest, res: Response) {
  try {
    if (rejectsClientChurchId(req.body)) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    }
    const enabled = await withEnabledFollowUp(req, res);
    if (!enabled) return;
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) {
      return res.status(404).json({ error: 'Acompanhamento não encontrado.' });
    }
    const item = await VisitorFollowUp.findOne(filter);
    if (!item || item.anonymizedAt) {
      return res.status(404).json({ error: 'Acompanhamento não encontrado.' });
    }

    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    if ('assignedToId' in body) {
      if (!hasPermission(req.auth!.permissions, 'follow_up:reassign')) {
        return res.status(403).json({ error: FOLLOW_UP_FORBIDDEN_ERROR });
      }
      const assignee = await resolveAssignee(req.auth!.churchId, body.assignedToId);
      if ('error' in assignee && assignee.error) {
        return res.status(400).json({ error: assignee.error });
      }
      item.assignedTo = assignee.assignedTo;
      item.assignedToName = assignee.assignedToName || '';
    }
    if (body.status === 'closed') {
      if (!hasPermission(req.auth!.permissions, 'follow_up:close')) {
        return res.status(403).json({ error: FOLLOW_UP_FORBIDDEN_ERROR });
      }
      item.status = 'closed';
    }

    item.updatedBy = actorFromRequest(req);
    await item.save();
    const visitorPreviewFilter = tenantRecordFilter(req.auth!.churchId, item.visitorId);
    const visitor = visitorPreviewFilter
      ? await Visitor.findOne(visitorPreviewFilter).select('name city visitDate')
      : null;
    return sendPrivateJson(
      res,
      serializeFollowUp(item, visitor || undefined, {
        includePhone: true,
        timeZone: enabled.timezone,
      })
    );
  } catch {
    return res.status(500).json({ error: 'Não foi possível atualizar o acompanhamento.' });
  }
}

export async function createFollowUpContact(req: AuthenticatedRequest, res: Response) {
  try {
    if (rejectsClientChurchId(req.body)) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    }
    const enabled = await withEnabledFollowUp(req, res);
    if (!enabled) return;
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) {
      return res.status(404).json({ error: 'Acompanhamento não encontrado.' });
    }
    const item = await VisitorFollowUp.findOne(filter);
    if (!item || item.anonymizedAt) {
      return res.status(404).json({ error: 'Acompanhamento não encontrado.' });
    }

    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const parsed = parseContactBody(body, enabled.timezone);
    if ('error' in parsed) {
      return res.status(400).json({ error: parsed.error });
    }
    if (parsed.status === 'closed' && !hasPermission(req.auth!.permissions, 'follow_up:close')) {
      return res.status(403).json({ error: FOLLOW_UP_FORBIDDEN_ERROR });
    }

    const createdBy = actorFromRequest(req);
    const contact = await FollowUpContact.create({
      churchId: req.auth!.churchId,
      followUpId: item._id,
      visitorId: item.visitorId,
      contactedAt: parsed.contactedAt,
      type: parsed.type,
      result: parsed.result,
      note: parsed.note,
      nextContactAt: parsed.nextContactAt,
      status: parsed.status,
      createdBy,
    });

    item.status = parsed.status;
    if (parsed.nextContactAt) item.nextContactAt = parsed.nextContactAt;
    item.updatedBy = createdBy;
    await item.save();

    return sendPrivateJson(
      res,
      {
        id: String(contact._id),
        contactedAt: contact.contactedAt,
        type: contact.type,
        result: contact.result,
        note: contact.note || undefined,
        nextContactAt: contact.nextContactAt,
        status: contact.status,
        createdBy: createdBy.name ? { name: createdBy.name } : undefined,
        createdAt: contact.createdAt,
      },
      201
    );
  } catch {
    return res.status(500).json({ error: 'Não foi possível registrar o contato.' });
  }
}

router.use(requireAuth);
router.get('/', requirePermission('follow_up:read'), listFollowUps);
router.get(
  '/assignees',
  requireAnyPermission('follow_up:read', 'follow_up:create', 'follow_up:reassign'),
  listFollowUpAssignees
);
router.get('/available-visitors', requirePermission('follow_up:create'), listAvailableFollowUpVisitors);
router.post('/', requirePermission('follow_up:create'), createFollowUp);
router.get('/:id', requirePermission('follow_up:read'), getFollowUp);
router.patch('/:id', requireAnyPermission('follow_up:reassign', 'follow_up:close'), patchFollowUp);
router.post('/:id/contacts', requirePermission('follow_up:contact'), createFollowUpContact);

export default router;
