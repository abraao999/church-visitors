import { Router, Response } from 'express';
import { PrayerRequest } from '../models/PrayerRequest.js';
import {
  requireAuth,
  toActor,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { requireAnyPermission, requirePermission } from '../middleware/requirePermission.js';
import { resolveLinkedServiceId } from '../services/activeService.js';
import { fetchPrayerPanel } from '../services/panelData.js';
import { hasPermission } from '../utils/permissions.js';
import { endOfDay, parseDateOnly, startOfDay } from '../utils/dayRange.js';
import {
  PRAYER_LIST_FIELDS,
  sendPrivateJson,
  serializePrayerRequest,
  setPrivateCacheHeaders,
} from '../utils/publicRecord.js';
import { tenantRecordFilter, withChurch } from '../utils/tenant.js';

const router = Router();

export async function countPrayerRequests(req: AuthenticatedRequest, res: Response) {
  try {
    const dateParam = req.query.date as string | undefined;
    const date = dateParam ? parseDateOnly(dateParam) : new Date();

    if (!date) {
      return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
    }

    const count = await PrayerRequest.countDocuments(
      withChurch(req.auth!.churchId, {
        createdAt: { $gte: startOfDay(date), $lte: endOfDay(date) },
      })
    );

    return sendPrivateJson(res, { count });
  } catch {
    res.status(500).json({ error: 'Erro ao contar pedidos de oração' });
  }
}

export async function listPrayerRequests(req: AuthenticatedRequest, res: Response) {
  try {
    const dateParam = req.query.date as string | undefined;
    const date = dateParam ? parseDateOnly(dateParam) : new Date();

    if (!date) {
      return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
    }

    const requests = await PrayerRequest.find(
      withChurch(req.auth!.churchId, {
        createdAt: { $gte: startOfDay(date), $lte: endOfDay(date) },
      })
    )
      .select(PRAYER_LIST_FIELDS)
      .sort({ createdAt: -1 });

    return sendPrivateJson(res, requests.map(serializePrayerRequest));
  } catch {
    res.status(500).json({ error: 'Erro ao buscar pedidos de oração' });
  }
}

/**
 * Painel de TV: devolve somente pedidos autorizados e apenas os campos que
 * aparecem na projeção. Quem registrou e qual acesso originou ficam de fora.
 */
export async function listPrayerRequestsPanel(req: AuthenticatedRequest, res: Response) {
  try {
    const dateParam = req.query.date as string | undefined;
    const date = dateParam ? parseDateOnly(dateParam) : new Date();

    if (!date) {
      return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
    }

    setPrivateCacheHeaders(res);
    res.json(await fetchPrayerPanel(req.auth!.churchId, date));
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

    const linked = await resolveLinkedServiceId(req.auth!.churchId, body.serviceId, {
      allowChoose: hasPermission(req.auth!.permissions, 'services:read'),
    });
    if (linked.error) {
      return res.status(400).json({ error: linked.error });
    }

    const prayerRequest = await PrayerRequest.create({
      churchId: req.auth!.churchId,
      name: anonymous ? '' : name,
      request,
      source: 'owner',
      isAnonymous: anonymous,
      allowProjection: body.allowProjection === true,
      createdBy: toActor(req.auth!),
      ...(linked.serviceId ? { serviceId: linked.serviceId } : {}),
    });

    return sendPrivateJson(res, serializePrayerRequest(prayerRequest), 201);
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

router.get('/', requireAuth, requirePermission('prayers:read'), listPrayerRequests);
router.get('/stats', requireAuth, requirePermission('prayers:read'), countPrayerRequests);
router.get('/panel', requireAuth, requireAnyPermission('panels:open', 'prayers:read', 'prayers:project'), listPrayerRequestsPanel);
router.post('/', requireAuth, requirePermission('prayers:create'), createPrayerRequest);
router.delete('/:id', requireAuth, requirePermission('prayers:delete'), deletePrayerRequest);

export default router;
