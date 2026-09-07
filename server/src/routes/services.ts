import { Router, Response } from 'express';
import { PrayerRequest } from '../models/PrayerRequest.js';
import { RecurrenceSeries } from '../models/RecurrenceSeries.js';
import { Service, type IHymn } from '../models/Service.js';
import { VehicleNotice } from '../models/VehicleNotice.js';
import { Visitor } from '../models/Visitor.js';
import type { IActor } from '../models/Actor.js';
import {
  requireAuth,
  toActor,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { requireAnyPermission, requirePermission } from '../middleware/requirePermission.js';
import { resolveActiveService, timezoneForChurch } from '../services/activeService.js';
import { fetchHymnPanel } from '../services/panelData.js';
import {
  cancelOccurrence,
  closeOccurrence,
  createServices,
  extendOccurrence,
  openOccurrence,
  parseEditScope,
  parseServiceWrite,
  updateOccurrence,
} from '../services/serviceMutations.js';
import { endOfDay, parseDateOnly, startOfDay } from '../utils/dayRange.js';
import {
  sendPrivateJson,
  serializePrayerRequest,
  serializeService,
  serializeVisitor,
  SERVICE_LIST_FIELDS,
  setPrivateCacheHeaders,
} from '../utils/publicRecord.js';
import {
  MISSING_UPDATED_AT_ERROR,
  STALE_WRITE_ERROR,
  parseExpectedUpdatedAt,
  sameInstant,
} from '../utils/optimistic.js';
import {
  buildServicePreview,
  DEFAULT_DURATION_MINUTES,
  frequencyLabel,
  parseClock,
  parseDateInput,
  parseDurationMinutes,
  parseFrequency,
} from '../utils/serviceSchedule.js';
import { tenantRecordFilter, withChurch } from '../utils/tenant.js';

const router = Router();

function httpError(error: unknown): { status: number; message: string } {
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
    return { status: error.status, message: error instanceof Error ? error.message : 'Erro' };
  }
  return { status: 500, message: error instanceof Error ? error.message : 'Erro ao processar o culto' };
}

function normalizeHymns(
  hymns: unknown,
  actor: IActor,
  previous: IHymn[] = []
): { data: IHymn[]; error?: string } {
  if (hymns == null) return { data: [] };
  if (!Array.isArray(hymns)) {
    return { data: [], error: 'Lista de louvores inválida' };
  }

  const data: IHymn[] = [];

  for (const item of hymns) {
    if (!item || typeof item !== 'object') {
      return { data: [], error: 'Louvor inválido' };
    }

    const raw = item as {
      title?: unknown;
      artist?: unknown;
      singer?: unknown;
      performedBy?: unknown;
    };

    const title = String(raw.title ?? '').trim();
    const artist = String(raw.artist ?? raw.singer ?? '').trim();
    const performedBy = String(raw.performedBy ?? '').trim();
    const filled = [title, artist, performedBy].filter(Boolean).length;

    if (filled === 0) continue;

    if (filled < 3) {
      return {
        data: [],
        error: 'Cada louvor precisa de nome, cantor (dono da música) e quem canta no culto',
      };
    }

    const previousMatch = previous.find(
      (h) => h.title === title && h.artist === artist && h.performedBy === performedBy
    );

    data.push({
      title,
      artist,
      performedBy,
      addedBy: previousMatch?.addedBy ?? actor,
    });
  }

  return { data };
}

function serializeSeries(
  series: {
    _id?: unknown;
    title: string;
    frequency: 'weekly' | 'biweekly';
    weekday: number;
    startDate: Date;
    endDate: Date;
    time: string;
    durationMinutes: number;
    activationLeadMinutes: number;
    active: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  },
  extras: Record<string, unknown> = {}
) {
  return {
    id: String(series._id),
    title: series.title,
    frequency: series.frequency,
    frequencyLabel: frequencyLabel(series.frequency),
    weekday: series.weekday,
    startDate: series.startDate,
    endDate: series.endDate,
    time: series.time,
    durationMinutes: series.durationMinutes,
    activationLeadMinutes: series.activationLeadMinutes,
    active: series.active,
    createdAt: series.createdAt,
    updatedAt: series.updatedAt,
    ...extras,
  };
}

router.get('/', requireAuth, requirePermission('services:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;
    const dateParam = req.query.date as string | undefined;
    const timeZone = await timezoneForChurch(req.auth!.churchId);
    const now = new Date();

    let filter: Record<string, unknown> = {};

    if (fromParam || toParam) {
      const from = fromParam ? parseDateOnly(fromParam) : null;
      const to = toParam ? parseDateOnly(toParam) : null;

      if ((fromParam && !from) || (toParam && !to)) {
        return res.status(400).json({ error: 'Parâmetros from/to inválidos. Use YYYY-MM-DD' });
      }

      filter = {
        date: {
          ...(from ? { $gte: startOfDay(from, timeZone) } : {}),
          ...(to ? { $lte: endOfDay(to, timeZone) } : {}),
        },
      };
    } else {
      const date = dateParam ? parseDateOnly(dateParam) : new Date();
      if (!date) {
        return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
      }

      filter = {
        date: { $gte: startOfDay(date, timeZone), $lte: endOfDay(date, timeZone) },
      };
    }

    const services = await Service.find(withChurch(req.auth!.churchId, filter))
      .select(SERVICE_LIST_FIELDS)
      .sort({
        date: 1,
        time: 1,
        createdAt: 1,
      });
    return sendPrivateJson(res, services.map((service) => serializeService(service, now, timeZone)));
  } catch {
    res.status(500).json({ error: 'Erro ao buscar cultos' });
  }
});

/** Painel de TV: título, horário e louvores. Sem quem adicionou cada louvor. */
router.get('/panel', requireAuth, requireAnyPermission('panels:open', 'services:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dateParam = req.query.date as string | undefined;
    const date = dateParam ? parseDateOnly(dateParam) : new Date();

    if (!date) {
      return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
    }

    setPrivateCacheHeaders(res);
    res.json(await fetchHymnPanel(req.auth!.churchId, date));
  } catch {
    res.status(500).json({ error: 'Erro ao buscar cultos' });
  }
});

router.get('/active', requireAuth, requireAnyPermission('services:read', 'visitors:create', 'prayers:create', 'vehicle_notices:create'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const timeZone = await timezoneForChurch(req.auth!.churchId);
    const now = new Date();
    const service = await resolveActiveService(req.auth!.churchId, now, timeZone);
    return sendPrivateJson(res, {
      now,
      service: service ? serializeService(service, now, timeZone) : null,
    });
  } catch {
    res.status(500).json({ error: 'Erro ao localizar o culto ativo' });
  }
});

router.post('/preview', requireAuth, requirePermission('services:create'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const date = parseDateInput(body.date);
    const time = parseClock(body.time);
    const durationMinutes = parseDurationMinutes(body.durationMinutes) ?? DEFAULT_DURATION_MINUTES;
    const recurring = body.recurring === true || body.recurring === 'true';
    const frequency = parseFrequency(body.frequency) ?? 'weekly';
    const endDate = parseDateInput(body.endDate);
    if (!date || !time) {
      return res.status(400).json({ error: 'Informe a data e o horário do culto.' });
    }
    const timeZone = await timezoneForChurch(req.auth!.churchId);
    const preview = buildServicePreview({
      startDate: date,
      time,
      durationMinutes,
      recurring,
      frequency,
      endDate: endDate ?? undefined,
      timeZone,
    });
    return sendPrivateJson(res, preview);
  } catch {
    res.status(500).json({ error: 'Erro ao calcular a prévia do culto' });
  }
});

router.get('/series/:seriesId', requireAuth, requirePermission('services:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.seriesId);
    if (!filter) {
      return res.status(404).json({ error: 'Série não encontrada' });
    }

    const series = await RecurrenceSeries.findOne(filter);
    if (!series) {
      return res.status(404).json({ error: 'Série não encontrada' });
    }

    const timeZone = await timezoneForChurch(req.auth!.churchId);
    const now = new Date();
    const occurrences = await Service.find(
      withChurch(req.auth!.churchId, { recurrenceSeriesId: series._id })
    ).sort({ scheduledStartAt: 1, date: 1 });

    return sendPrivateJson(res, {
      now,
      series: serializeSeries(series, { occurrenceCount: occurrences.length }),
      occurrences: occurrences.map((service) => serializeService(service, now, timeZone)),
    });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar a série' });
  }
});

router.get('/:id', requireAuth, requirePermission('services:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) {
      return res.status(404).json({ error: 'Culto não encontrado' });
    }

    const service = await Service.findOne(filter);
    if (!service) {
      return res.status(404).json({ error: 'Culto não encontrado' });
    }

    const timeZone = await timezoneForChurch(req.auth!.churchId);
    const now = new Date();
    const series = service.recurrenceSeriesId
      ? await RecurrenceSeries.findOne(
          withChurch(req.auth!.churchId, { _id: service.recurrenceSeriesId })
        )
      : null;
    const [visitors, prayers, pendingNotices] = await Promise.all([
      Visitor.countDocuments(withChurch(req.auth!.churchId, { serviceId: service._id })),
      PrayerRequest.countDocuments(withChurch(req.auth!.churchId, { serviceId: service._id })),
      VehicleNotice.countDocuments(
        withChurch(req.auth!.churchId, {
          serviceId: service._id,
          archived: false,
          status: { $in: ['pending', 'announced'] },
        })
      ),
    ]);

    return sendPrivateJson(res, {
      ...serializeService(service, now, timeZone),
      series: series ? serializeSeries(series) : null,
      counts: {
        visitors,
        prayers,
        pendingNotices,
        hymns: service.hymns.length,
      },
    });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar culto' });
  }
});

router.get('/:id/activity', requireAuth, requirePermission('services:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) {
      return res.status(404).json({ error: 'Culto não encontrado' });
    }
    const service = await Service.findOne(filter).select('_id churchId');
    if (!service) {
      return res.status(404).json({ error: 'Culto não encontrado' });
    }

    const [visitors, prayers, notices] = await Promise.all([
      Visitor.find(withChurch(req.auth!.churchId, { serviceId: service._id }))
        .select('name city createdAt visitDate')
        .sort({ createdAt: -1 })
        .limit(20),
      PrayerRequest.find(withChurch(req.auth!.churchId, { serviceId: service._id }))
        .select('name request source createdAt')
        .sort({ createdAt: -1 })
        .limit(20),
      VehicleNotice.find(withChurch(req.auth!.churchId, { serviceId: service._id, archived: false }))
        .select('plate requestedAction status createdAt')
        .sort({ createdAt: -1 })
        .limit(20),
    ]);

    return sendPrivateJson(res, {
      visitors: visitors.map(serializeVisitor),
      prayers: prayers.map(serializePrayerRequest),
      notices: notices.map((notice) => ({
        id: String(notice._id),
        plate: notice.plate,
        requestedAction: notice.requestedAction,
        status: notice.status,
        createdAt: notice.createdAt,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar o movimento da recepção' });
  }
});

router.post('/', requireAuth, requirePermission('services:create'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = toActor(req.auth!);
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const payload = parseServiceWrite(body, { requireTime: true, allowRecurring: true });
    if (payload.error || !payload.data) {
      return res.status(400).json({ error: payload.error || 'Revise os dados do culto' });
    }

    const hymnsResult = normalizeHymns(body.hymns, actor);
    if (hymnsResult.error) {
      return res.status(400).json({ error: hymnsResult.error });
    }

    const created = await createServices({
      churchId: req.auth!.churchId,
      actor,
      data: payload.data,
      hymns: hymnsResult.data,
    });

    const timeZone = await timezoneForChurch(req.auth!.churchId);
    return sendPrivateJson(
      res,
      {
        service: serializeService(created.service, new Date(), timeZone),
        createdCount: created.createdCount,
        seriesId: created.series ? String(created.series._id) : undefined,
      },
      201
    );
  } catch (error) {
    const parsed = httpError(error);
    res.status(parsed.status).json({ error: parsed.message });
  }
});

router.post('/:id/open', requireAuth, requirePermission('services:update'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) return res.status(404).json({ error: 'Culto não encontrado' });
    const service = await Service.findOne(filter);
    if (!service) return res.status(404).json({ error: 'Culto não encontrado' });
    const updated = await openOccurrence(req.auth!.churchId, service);
    const timeZone = await timezoneForChurch(req.auth!.churchId);
    return sendPrivateJson(res, serializeService(updated, new Date(), timeZone));
  } catch (error) {
    const parsed = httpError(error);
    res.status(parsed.status).json({ error: parsed.message });
  }
});

router.post('/:id/close', requireAuth, requirePermission('services:update'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) return res.status(404).json({ error: 'Culto não encontrado' });
    const service = await Service.findOne(filter);
    if (!service) return res.status(404).json({ error: 'Culto não encontrado' });
    const updated = await closeOccurrence(req.auth!.churchId, service);
    const timeZone = await timezoneForChurch(req.auth!.churchId);
    return sendPrivateJson(res, serializeService(updated, new Date(), timeZone));
  } catch (error) {
    const parsed = httpError(error);
    res.status(parsed.status).json({ error: parsed.message });
  }
});

router.post('/:id/extend', requireAuth, requirePermission('services:update'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) return res.status(404).json({ error: 'Culto não encontrado' });
    const service = await Service.findOne(filter);
    if (!service) return res.status(404).json({ error: 'Culto não encontrado' });
    const minutes = Number((req.body as { minutes?: unknown })?.minutes);
    const updated = await extendOccurrence(req.auth!.churchId, service, minutes);
    const timeZone = await timezoneForChurch(req.auth!.churchId);
    return sendPrivateJson(res, serializeService(updated, new Date(), timeZone));
  } catch (error) {
    const parsed = httpError(error);
    res.status(parsed.status).json({ error: parsed.message });
  }
});

router.post('/:id/cancel', requireAuth, requirePermission('services:update'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) return res.status(404).json({ error: 'Culto não encontrado' });
    const service = await Service.findOne(filter);
    if (!service) return res.status(404).json({ error: 'Culto não encontrado' });
    const updated = await cancelOccurrence(req.auth!.churchId, service);
    const timeZone = await timezoneForChurch(req.auth!.churchId);
    return sendPrivateJson(res, serializeService(updated, new Date(), timeZone));
  } catch (error) {
    const parsed = httpError(error);
    res.status(parsed.status).json({ error: parsed.message });
  }
});

router.put('/:id', requireAuth, requirePermission('services:update'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) {
      return res.status(404).json({ error: 'Culto não encontrado' });
    }

    const existing = await Service.findOne(filter);
    if (!existing) {
      return res.status(404).json({ error: 'Culto não encontrado' });
    }

    const actor = toActor(req.auth!);
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const payload = parseServiceWrite(
      {
        ...body,
        date: body.date ?? existing.date,
        time: body.time ?? existing.time ?? '',
        durationMinutes: body.durationMinutes ?? existing.durationMinutes ?? DEFAULT_DURATION_MINUTES,
      },
      { requireTime: Boolean(existing.time || existing.recurrenceSeriesId), allowRecurring: false }
    );
    if (payload.error || !payload.data) {
      return res.status(400).json({ error: payload.error || 'Revise os dados do culto' });
    }

    const hymnsResult = normalizeHymns(body.hymns, actor, existing.hymns);
    if (hymnsResult.error) {
      return res.status(400).json({ error: hymnsResult.error });
    }

    const expectedUpdatedAt = parseExpectedUpdatedAt(body.updatedAt);
    if (!expectedUpdatedAt) {
      return res.status(400).json({ error: MISSING_UPDATED_AT_ERROR });
    }
    if (!sameInstant(existing.updatedAt, expectedUpdatedAt)) {
      return res.status(409).json({ error: STALE_WRITE_ERROR });
    }

    const updated = await updateOccurrence({
      churchId: req.auth!.churchId,
      service: existing,
      data: { ...payload.data, hymns: hymnsResult.data },
      hymns: hymnsResult.data,
      scope: parseEditScope(body.editScope),
    });

    const timeZone = await timezoneForChurch(req.auth!.churchId);
    return sendPrivateJson(res, serializeService(updated, new Date(), timeZone));
  } catch (error) {
    const parsed = httpError(error);
    res.status(parsed.status).json({ error: parsed.message });
  }
});

router.delete('/:id', requireAuth, requirePermission('services:delete'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) {
      return res.status(404).json({ error: 'Culto não encontrado' });
    }

    const existing = await Service.findOne(filter);
    if (!existing) {
      return res.status(404).json({ error: 'Culto não encontrado' });
    }

    if (existing.recurrenceSeriesId) {
      await cancelOccurrence(req.auth!.churchId, existing);
      return res.json({ message: 'Ocorrência cancelada' });
    }

    const deleted = await Service.findOneAndDelete(filter);
    if (!deleted) {
      return res.status(404).json({ error: 'Culto não encontrado' });
    }
    res.json({ message: 'Culto removido' });
  } catch {
    res.status(500).json({ error: 'Erro ao remover culto' });
  }
});

export default router;
