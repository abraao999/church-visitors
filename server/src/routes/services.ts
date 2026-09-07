import { Router, Response } from 'express';
import { Service, type IHymn } from '../models/Service.js';
import type { IActor } from '../models/Actor.js';
import {
  requireAuth,
  toActor,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { requireAnyPermission, requirePermission } from '../middleware/requirePermission.js';
import { fetchHymnPanel } from '../services/panelData.js';
import { endOfDay, parseDateOnly, startOfDay } from '../utils/dayRange.js';
import {
  sendPrivateJson,
  serializeService,
  SERVICE_LIST_FIELDS,
  setPrivateCacheHeaders,
} from '../utils/publicRecord.js';
import {
  MISSING_UPDATED_AT_ERROR,
  STALE_WRITE_ERROR,
  parseExpectedUpdatedAt,
  sameInstant,
} from '../utils/optimistic.js';
import { tenantRecordFilter, withChurch } from '../utils/tenant.js';

const router = Router();

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

function weeklyDatesUntilYearEnd(start: Date): Date[] {
  const dates: Date[] = [];
  const year = start.getFullYear();
  const current = new Date(start);

  while (current.getFullYear() === year) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 7);
  }

  return dates;
}

function buildPayload(
  body: Record<string, unknown>,
  actor: IActor,
  previousHymns: IHymn[] = []
) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const time = typeof body.time === 'string' ? body.time.trim() : '';
  const dateRaw = typeof body.date === 'string' ? body.date : '';
  const date = parseDateOnly(dateRaw.split('T')[0] ?? '');
  const hymnsResult = normalizeHymns(body.hymns, actor, previousHymns);
  const recurring = body.recurring === true || body.recurring === 'true';

  if (!title) {
    return { error: 'Título do culto é obrigatório' as const };
  }

  if (!date) {
    return { error: 'Data do culto é obrigatória' as const };
  }

  if (recurring && !time) {
    return { error: 'Horário é obrigatório para culto recorrente' as const };
  }

  if (hymnsResult.error) {
    return { error: hymnsResult.error };
  }

  return {
    data: {
      title,
      date,
      time,
      hymns: hymnsResult.data,
    },
    recurring,
  };
}

router.get('/', requireAuth, requirePermission('services:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;
    const dateParam = req.query.date as string | undefined;

    let filter: Record<string, unknown> = {};

    if (fromParam || toParam) {
      const from = fromParam ? parseDateOnly(fromParam) : null;
      const to = toParam ? parseDateOnly(toParam) : null;

      if ((fromParam && !from) || (toParam && !to)) {
        return res.status(400).json({ error: 'Parâmetros from/to inválidos. Use YYYY-MM-DD' });
      }

      filter = {
        date: {
          ...(from ? { $gte: startOfDay(from) } : {}),
          ...(to ? { $lte: endOfDay(to) } : {}),
        },
      };
    } else {
      const date = dateParam ? parseDateOnly(dateParam) : new Date();
      if (!date) {
        return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
      }

      filter = {
        date: { $gte: startOfDay(date), $lte: endOfDay(date) },
      };
    }

    const services = await Service.find(withChurch(req.auth!.churchId, filter))
      .select(SERVICE_LIST_FIELDS)
      .sort({
        date: 1,
        time: 1,
        createdAt: 1,
      });
    return sendPrivateJson(res, services.map(serializeService));
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
    return sendPrivateJson(res, serializeService(service));
  } catch {
    res.status(500).json({ error: 'Erro ao buscar culto' });
  }
});

router.post('/', requireAuth, requirePermission('services:create'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actor = toActor(req.auth!);
    const payload = buildPayload(req.body, actor);
    if ('error' in payload) {
      return res.status(400).json({ error: payload.error });
    }

    const { title, date, time, hymns } = payload.data;

    if (payload.recurring) {
      const dates = weeklyDatesUntilYearEnd(date);
      const created = await Service.insertMany(
        dates.map((occurrenceDate) => ({
          churchId: req.auth!.churchId,
          title,
          date: occurrenceDate,
          time,
          hymns: [],
          createdBy: actor,
        }))
      );

      const first = created[0];
      if (!first) {
        return res.status(500).json({ error: 'Erro ao criar culto' });
      }

      return sendPrivateJson(
        res,
        {
          service: serializeService(first),
          createdCount: created.length,
        },
        201
      );
    }

    const service = await Service.create({
      churchId: req.auth!.churchId,
      title,
      date,
      time,
      hymns,
      createdBy: actor,
    });
    return sendPrivateJson(
      res,
      {
        service: serializeService(service),
        createdCount: 1,
      },
      201
    );
  } catch {
    res.status(500).json({ error: 'Erro ao criar culto' });
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
    const payload = buildPayload(req.body, actor, existing.hymns);
    if ('error' in payload) {
      return res.status(400).json({ error: payload.error });
    }

    const expectedUpdatedAt = parseExpectedUpdatedAt(req.body?.updatedAt);
    if (!expectedUpdatedAt) {
      return res.status(400).json({ error: MISSING_UPDATED_AT_ERROR });
    }
    if (!sameInstant(existing.updatedAt, expectedUpdatedAt)) {
      return res.status(409).json({ error: STALE_WRITE_ERROR });
    }

    existing.title = payload.data.title;
    existing.date = payload.data.date;
    existing.time = payload.data.time;
    existing.hymns = payload.data.hymns;
    await existing.save();

    return sendPrivateJson(res, serializeService(existing));
  } catch {
    res.status(500).json({ error: 'Erro ao atualizar culto' });
  }
});

router.delete('/:id', requireAuth, requirePermission('services:delete'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) {
      return res.status(404).json({ error: 'Culto não encontrado' });
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
