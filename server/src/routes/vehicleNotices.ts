import { Router, type Response } from 'express';
import {
  requireAuth,
  toActor,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { FORBIDDEN_ERROR, requireAnyPermission, requirePermission } from '../middleware/requirePermission.js';
import { hasPermission } from '../utils/permissions.js';
import {
  VehicleNotice,
  isVehicleNoticeAction,
  isVehicleNoticeStatus,
  type VehicleNoticeStatus,
} from '../models/VehicleNotice.js';
import { resolveLinkedServiceId } from '../services/activeService.js';
import { fetchVehicleNoticePanel } from '../services/panelData.js';
import { endOfDay, parseDateOnly, startOfDay } from '../utils/dayRange.js';
import { sendPrivateJson, setPrivateCacheHeaders } from '../utils/publicRecord.js';
import { tenantRecordFilter, withChurch } from '../utils/tenant.js';
import { parseVehiclePlate } from '../utils/vehiclePlate.js';
import { Types } from 'mongoose';
import {
  MISSING_UPDATED_AT_ERROR,
  STALE_WRITE_ERROR,
  parseExpectedUpdatedAt,
  sameInstant,
} from '../utils/optimistic.js';

const router = Router();

const ALLOWED_TRANSITIONS: Record<VehicleNoticeStatus, VehicleNoticeStatus[]> = {
  pending: ['announced', 'resolved'],
  announced: ['resolved', 'pending'],
  resolved: ['pending'],
};

function serializeNotice(notice: {
  _id: unknown;
  plate: string;
  plateNormalized: string;
  vehicleModel: string;
  requestedAction: string;
  otherDescription?: string;
  details?: string;
  status: string;
  source: string;
  guestAccess?: { name?: string };
  announcedAt?: Date;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: String(notice._id),
    plate: notice.plate,
    plateNormalized: notice.plateNormalized,
    vehicleModel: notice.vehicleModel,
    requestedAction: notice.requestedAction,
    otherDescription: notice.otherDescription || '',
    details: notice.details || '',
    status: notice.status,
    source: notice.source,
    guestAccessName: notice.guestAccess?.name || '',
    announcedAt: notice.announcedAt,
    resolvedAt: notice.resolvedAt,
    createdAt: notice.createdAt,
    updatedAt: notice.updatedAt,
  };
}

export async function listVehicleNotices(req: AuthenticatedRequest, res: Response) {
  try {
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined;
    const plateQuery = typeof req.query.plate === 'string' ? req.query.plate : undefined;

    const filter: Record<string, unknown> = { archived: false };

    if (dateParam) {
      const date = parseDateOnly(dateParam);
      if (!date) {
        return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
      }
      filter.createdAt = { $gte: startOfDay(date), $lte: endOfDay(date) };
    }

    if (statusParam && statusParam !== 'all') {
      if (!isVehicleNoticeStatus(statusParam)) {
        return res.status(400).json({ error: 'Status inválido.' });
      }
      filter.status = statusParam;
    }

    if (plateQuery?.trim()) {
      const parsed = parseVehiclePlate(plateQuery);
      const normalized =
        parsed?.plateNormalized ||
        plateQuery.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 7);
      if (normalized) {
        const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.plateNormalized = { $regex: `^${escaped}` };
      }
    }

    const notices = await VehicleNotice.find(withChurch(req.auth!.churchId, filter)).sort({
      createdAt: -1,
    });

    return sendPrivateJson(res, notices.map(serializeNotice));
  } catch {
    return res.status(500).json({ error: 'Erro ao buscar avisos de veículos' });
  }
}

export async function listVehicleNoticesPanel(req: AuthenticatedRequest, res: Response) {
  try {
    const notices = await fetchVehicleNoticePanel(req.auth!.churchId);

    setPrivateCacheHeaders(res);
    return res.json(notices);
  } catch {
    return res.status(500).json({ error: 'Erro ao carregar o painel de veículos' });
  }
}

export async function getVehicleNoticeStats(req: AuthenticatedRequest, res: Response) {
  try {
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    const day = dateParam ? parseDateOnly(dateParam) : new Date();
    if (!day) {
      return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
    }

    const churchFilter = withChurch(req.auth!.churchId, { archived: false });
    const dayFilter = {
      ...churchFilter,
      createdAt: { $gte: startOfDay(day), $lte: endOfDay(day) },
    };

    const [pending, announced, resolvedToday] = await Promise.all([
      VehicleNotice.countDocuments({ ...churchFilter, status: 'pending' }),
      VehicleNotice.countDocuments({ ...churchFilter, status: 'announced' }),
      VehicleNotice.countDocuments({ ...dayFilter, status: 'resolved' }),
    ]);

    return res.json({ pending, announced, resolvedToday });
  } catch {
    return res.status(500).json({ error: 'Erro ao carregar resumo dos avisos' });
  }
}

export async function updateVehicleNoticeStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) {
      return res.status(404).json({ error: 'Aviso não encontrado' });
    }

    const nextStatus = req.body?.status;
    if (!isVehicleNoticeStatus(nextStatus)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const notice = await VehicleNotice.findOne({ ...filter, archived: false });
    if (!notice) {
      return res.status(404).json({ error: 'Aviso não encontrado' });
    }

    const expectedUpdatedAt = parseExpectedUpdatedAt(req.body?.updatedAt);
    if (!expectedUpdatedAt) {
      return res.status(400).json({ error: MISSING_UPDATED_AT_ERROR });
    }
    if (!sameInstant(notice.updatedAt, expectedUpdatedAt)) {
      return res.status(409).json({ error: STALE_WRITE_ERROR });
    }

    const needed =
      nextStatus === 'announced'
        ? 'vehicle_notices:announce'
        : 'vehicle_notices:resolve';
    if (!hasPermission(req.auth!.permissions, needed)) {
      return res.status(403).json({ error: FORBIDDEN_ERROR });
    }

    const allowed = ALLOWED_TRANSITIONS[notice.status];
    if (!allowed.includes(nextStatus)) {
      return res.status(400).json({
        error: `Não é permitido alterar de “${notice.status}” para “${nextStatus}”.`,
      });
    }

    const userId = new Types.ObjectId(req.auth!.userId);
    notice.status = nextStatus;

    if (nextStatus === 'announced') {
      notice.announcedAt = new Date();
      notice.announcedBy = userId;
      notice.resolvedAt = undefined;
      notice.resolvedBy = undefined;
    } else if (nextStatus === 'resolved') {
      notice.resolvedAt = new Date();
      notice.resolvedBy = userId;
      if (!notice.announcedAt) {
        notice.announcedAt = notice.resolvedAt;
        notice.announcedBy = userId;
      }
    } else if (nextStatus === 'pending') {
      notice.announcedAt = undefined;
      notice.announcedBy = undefined;
      notice.resolvedAt = undefined;
      notice.resolvedBy = undefined;
    }

    await notice.save();
    return res.json(serializeNotice(notice));
  } catch {
    return res.status(500).json({ error: 'Erro ao atualizar o aviso' });
  }
}

export async function archiveVehicleNotice(req: AuthenticatedRequest, res: Response) {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) {
      return res.status(404).json({ error: 'Aviso não encontrado' });
    }

    const notice = await VehicleNotice.findOneAndUpdate(
      { ...filter, archived: false },
      { $set: { archived: true } },
      { new: true }
    );

    if (!notice) {
      return res.status(404).json({ error: 'Aviso não encontrado' });
    }

    return res.json({ success: true, message: 'Aviso arquivado' });
  } catch {
    return res.status(500).json({ error: 'Erro ao arquivar o aviso' });
  }
}

/** Criação pelo proprietário (opcional); churchId sempre da sessão. */
export async function createVehicleNoticeOwner(req: AuthenticatedRequest, res: Response) {
  try {
    if (req.body && typeof req.body === 'object' && 'churchId' in req.body) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    }

    const plate = parseVehiclePlate(req.body?.plate);
    if (!plate) {
      return res.status(400).json({ error: 'Confira a placa do veículo.' });
    }

    const vehicleModel =
      typeof req.body?.vehicleModel === 'string'
        ? req.body.vehicleModel.trim().replace(/\s+/g, ' ').slice(0, 120)
        : '';
    const requestedAction = req.body?.requestedAction;
    const otherDescription =
      typeof req.body?.otherDescription === 'string'
        ? req.body.otherDescription.trim().replace(/\s+/g, ' ').slice(0, 240)
        : '';
    const details =
      typeof req.body?.details === 'string' ? req.body.details.trim().slice(0, 500) : '';

    if (!vehicleModel || !isVehicleNoticeAction(requestedAction)) {
      return res.status(400).json({ error: 'Revise o modelo e a ação solicitada.' });
    }
    if (requestedAction === 'other' && !otherDescription) {
      return res.status(400).json({ error: 'Descreva o que precisa ser feito.' });
    }

    const linked = await resolveLinkedServiceId(req.auth!.churchId, req.body?.serviceId, {
      allowChoose: hasPermission(req.auth!.permissions, 'services:read'),
    });
    if (linked.error) {
      return res.status(400).json({ error: linked.error });
    }

    const notice = await VehicleNotice.create({
      churchId: req.auth!.churchId,
      plate: plate.plate,
      plateNormalized: plate.plateNormalized,
      vehicleModel,
      requestedAction,
      otherDescription,
      details,
      status: 'pending',
      source: 'owner',
      createdBy: toActor(req.auth!),
      archived: false,
      ...(linked.serviceId ? { serviceId: linked.serviceId } : {}),
    });

    return res.status(201).json(serializeNotice(notice));
  } catch {
    return res.status(500).json({ error: 'Erro ao registrar o aviso' });
  }
}

router.get('/', requireAuth, requirePermission('vehicle_notices:read'), listVehicleNotices);
router.get('/panel', requireAuth, requireAnyPermission('panels:open', 'vehicle_notices:read'), listVehicleNoticesPanel);
router.get('/stats', requireAuth, requirePermission('vehicle_notices:read'), getVehicleNoticeStats);
router.post('/', requireAuth, requirePermission('vehicle_notices:create'), createVehicleNoticeOwner);
router.patch('/:id/status', requireAuth, requirePermission('vehicle_notices:read'), updateVehicleNoticeStatus);
router.post('/:id/archive', requireAuth, requirePermission('vehicle_notices:archive'), archiveVehicleNotice);

export default router;
