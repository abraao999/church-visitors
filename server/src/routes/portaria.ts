import { Router, type Response } from 'express';
import { Types } from 'mongoose';
import {
  markPortariaDeviceUsed,
  requirePortariaDevice,
  type PortariaDeviceRequest,
} from '../middleware/portariaDevice.js';
import { Church } from '../models/Church.js';
import { PortariaDevice } from '../models/PortariaDevice.js';
import { PortariaPairing } from '../models/PortariaPairing.js';
import { Visitor, RELATIONSHIPS } from '../models/Visitor.js';
import {
  VehicleNotice,
  isVehicleNoticeAction,
} from '../models/VehicleNotice.js';
import type { Relationship } from '../constants/relationships.js';
import { resolveServiceAtCapture } from '../services/activeService.js';
import { createFollowUpRecord } from '../services/visitorFollowUp.js';
import { CHURCH_TIMEZONE } from '../utils/dayRange.js';
import {
  FOLLOW_UP_PHONE_REQUIRED_ERROR,
  isValidFollowUpPhone,
  normalizeFollowUpPhone,
  resolveNextContactAt,
} from '../utils/visitorFollowUp.js';

export const portariaSync = {
  resolveServiceAtCapture,
};
import { clientIp, consumeRateLimit, sendRateLimited } from '../utils/rateLimit.js';
import { getGuestAccessSecret } from '../utils/guestToken.js';
import { parseVehiclePlate } from '../utils/vehiclePlate.js';
import { normalizePanelObservation, readShowObservationOnPanel } from '../utils/panelText.js';
import { parseVisitKind } from '../utils/reportRange.js';
import {
  createPortariaDeviceToken,
  createPortariaPublicId,
  normalizeDeviceName,
  parseCapturedAt,
  parsePortariaPermissions,
  parsePortariaToken,
  parseRequestId,
  verifyPortariaPairingSignature,
} from '../utils/portariaToken.js';

const router = Router();
const MAX_VISITORS_PER_REQUEST = 10;
const MAX_DETAILS_LENGTH = 500;
const MAX_OTHER_DESCRIPTION = 240;
const PAIRING_PROBE_LIMIT = 120;

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

function rejectsClientChurchId(body: unknown): boolean {
  return Boolean(body && typeof body === 'object' && 'churchId' in body);
}

function rejectsClientServiceId(body: unknown): boolean {
  return Boolean(body && typeof body === 'object' && 'serviceId' in body);
}

function bodyHasStaffFollowUpFields(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const value = body as Record<string, unknown>;
  return (
    'assignedToId' in value ||
    'status' in value ||
    'history' in value ||
    'nextContactAt' in value ||
    'responsible' in value
  );
}

function normalizeSingleLine(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function isRelationship(value: unknown): value is Relationship {
  return typeof value === 'string' && RELATIONSHIPS.includes(value as Relationship);
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function userAgentFamily(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const raw = value.trim().slice(0, 180);
  if (!raw) return undefined;
  if (/iPhone|iPad|iPod/i.test(raw)) return 'iOS';
  if (/Android/i.test(raw)) return 'Android';
  if (/Macintosh/i.test(raw)) return 'macOS';
  if (/Windows/i.test(raw)) return 'Windows';
  return 'Outro';
}

async function loadValidPairing(token: unknown) {
  const parsed = parsePortariaToken(token);
  if (!parsed || !verifyPortariaPairingSignature(parsed)) {
    return { error: 'invalid' as const, pairing: null, church: null };
  }

  const pairing = await PortariaPairing.findOne({ publicId: parsed.publicId }).lean();
  if (!pairing) return { error: 'invalid' as const, pairing: null, church: null };
  if (pairing.consumedAt) return { error: 'used' as const, pairing: null, church: null };
  if (pairing.expiresAt.getTime() <= Date.now()) {
    return { error: 'expired' as const, pairing: null, church: null };
  }

  const church = await Church.findOne({ _id: pairing.churchId, active: true })
    .select('name visitorFollowUpEnabled')
    .lean();
  if (!church) return { error: 'invalid' as const, pairing: null, church: null };

  return { error: null, pairing, church };
}

function pairingError(res: Response, code: 'invalid' | 'used' | 'expired') {
  if (code === 'used') {
    return res.status(410).json({
      valid: false,
      code: 'pairing_used',
      error: 'Este convite já foi utilizado. Solicite um novo pareamento.',
    });
  }
  if (code === 'expired') {
    return res.status(410).json({
      valid: false,
      code: 'pairing_expired',
      error: 'Este convite expirou. Solicite um novo pareamento.',
    });
  }
  return res.status(404).json({
    valid: false,
    code: 'invalid',
    error: 'Este convite não é válido. Solicite um novo pareamento.',
  });
}

export async function inspectPortariaPairing(req: PortariaDeviceRequest, res: Response) {
  try {
    const secret = getGuestAccessSecret();
    if (!(await consumeRateLimit(secret, 'ip', clientIp(req), PAIRING_PROBE_LIMIT))) {
      return sendRateLimited(res, {
        valid: false,
        error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      });
    }
    const loaded = await loadValidPairing(req.params.token);
    if (loaded.error) return pairingError(res, loaded.error);
    return res.json({
      valid: true,
      churchName: loaded.church.name,
      visitorFollowUpEnabled: loaded.church.visitorFollowUpEnabled === true,
      expiresAt: loaded.pairing.expiresAt,
    });
  } catch {
    return res.status(503).json({
      valid: false,
      error: 'Não foi possível validar o convite agora.',
    });
  }
}

export async function claimPortariaPairing(req: PortariaDeviceRequest, res: Response) {
  try {
    if (rejectsClientChurchId(req.body)) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    }

    const secret = getGuestAccessSecret();
    if (!(await consumeRateLimit(secret, 'ip', clientIp(req), PAIRING_PROBE_LIMIT))) {
      return sendRateLimited(res, {
        valid: false,
        error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      });
    }

    const loaded = await loadValidPairing(req.params.token);
    if (loaded.error) return pairingError(res, loaded.error);

    const body =
      req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const deviceName = normalizeDeviceName(body.deviceName);
    const permissions = parsePortariaPermissions(body.permissions);
    if (!deviceName) {
      return res.status(400).json({ error: 'Informe um nome para o aparelho.' });
    }
    if (permissions.length === 0) {
      return res.status(400).json({ error: 'Selecione pelo menos uma permissão offline.' });
    }

    const device = await PortariaDevice.create({
      churchId: loaded.pairing.churchId,
      name: deviceName,
      publicId: createPortariaPublicId(),
      credentialVersion: 1,
      permissions,
      active: true,
      createdBy: loaded.pairing.createdBy,
      userAgentFamily: userAgentFamily(req.get('user-agent')),
    });

    const claimed = await PortariaPairing.findOneAndUpdate(
      { _id: loaded.pairing._id, consumedAt: { $exists: false } },
      { $set: { consumedAt: new Date(), deviceId: device._id } }
    );

    if (!claimed) {
      await PortariaDevice.deleteOne({ _id: device._id });
      return pairingError(res, 'used');
    }

    return res.status(201).json({
      churchName: loaded.church.name,
      deviceName: device.name,
      publicId: device.publicId,
      permissions: device.permissions,
      visitorFollowUpEnabled: loaded.church.visitorFollowUpEnabled === true,
      serverTime: new Date().toISOString(),
      credential: createPortariaDeviceToken(device.publicId, device.credentialVersion),
    });
  } catch {
    return res.status(500).json({ error: 'Não foi possível preparar este aparelho.' });
  }
}

export async function getPortariaDevice(req: PortariaDeviceRequest, res: Response) {
  const device = req.portariaDevice!;
  await markPortariaDeviceUsed(device).catch(() => undefined);
  return res.json({
    valid: true,
    churchName: device.churchName,
    deviceName: device.deviceName,
    publicId: device.publicId,
    permissions: device.permissions,
    visitorFollowUpEnabled: device.visitorFollowUpEnabled === true,
    serverTime: new Date().toISOString(),
  });
}

async function linkedServiceId(churchId: string, capturedAt: Date) {
  const service = await portariaSync.resolveServiceAtCapture(churchId, capturedAt);
  return service?._id;
}

export async function createPortariaVisitors(req: PortariaDeviceRequest, res: Response) {
  try {
    if (rejectsClientChurchId(req.body)) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    }
    if (rejectsClientServiceId(req.body)) {
      return res.status(400).json({ error: 'O culto não pode ser escolhido neste envio.' });
    }
    if (bodyHasStaffFollowUpFields(req.body)) {
      return res.status(400).json({ error: 'Estas informações não podem ser enviadas neste acesso.' });
    }

    const body =
      req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const rawVisitors = body.visitors;
    if (
      !Array.isArray(rawVisitors) ||
      rawVisitors.length === 0 ||
      rawVisitors.length > MAX_VISITORS_PER_REQUEST
    ) {
      return res.status(422).json({
        code: 'review',
        error: `Informe de 1 a ${MAX_VISITORS_PER_REQUEST} visitantes por envio.`,
        fields: { visitors: `Informe de 1 a ${MAX_VISITORS_PER_REQUEST} visitantes.` },
      });
    }

    const visitors = rawVisitors.map((raw) => {
      if (!raw || typeof raw === 'object' && ('churchId' in raw || 'serviceId' in raw)) {
        return null;
      }
      if (!raw || typeof raw !== 'object') return null;
      const item = raw as Record<string, unknown>;
      const name = normalizeSingleLine(item.name, 120);
      const city = normalizeSingleLine(item.city, 100);
      const relationshipRaw = typeof item.relationship === 'string' ? item.relationship : 'outro';
      if (!name || !city || !isRelationship(relationshipRaw)) return null;
      return {
        name,
        city,
        relationship: relationshipRaw,
        panelObservation: normalizePanelObservation(item.panelObservation),
        showObservationOnPanel: readShowObservationOnPanel(item.showObservationOnPanel),
        visitKind: parseVisitKind(item.visitKind),
        includeFollowUp: item.includeFollowUp === true,
      };
    });

    const people = visitors.filter((visitor): visitor is NonNullable<typeof visitor> => visitor !== null);
    if (people.length !== rawVisitors.length) {
      return res.status(422).json({
        code: 'review',
        error: 'Informe o nome e a cidade de cada visitante.',
        fields: { visitors: 'Informe o nome e a cidade de cada visitante.' },
      });
    }

    const captured = parseCapturedAt(body.capturedAt);
    if ('error' in captured) {
      return res.status(422).json({
        code: 'review',
        error: captured.error,
        fields: { capturedAt: captured.error },
      });
    }

    const device = req.portariaDevice!;
    const churchId = new Types.ObjectId(device.churchId);
    const requestId = parseRequestId(body.requestId);
    let followUpPhone = '';
    let followUpIndexes: number[] = [];
    let followUpAt: Date | undefined;
    if (body.contactConsent === true) {
      const church = await Church.findById(device.churchId).select('visitorFollowUpEnabled timezone').lean();
      if (church?.visitorFollowUpEnabled === true) {
        followUpPhone = normalizeFollowUpPhone(body.phone);
        if (!isValidFollowUpPhone(followUpPhone)) {
          return res.status(422).json({
            code: 'review',
            error: FOLLOW_UP_PHONE_REQUIRED_ERROR,
            fields: { phone: FOLLOW_UP_PHONE_REQUIRED_ERROR },
          });
        }
        followUpIndexes = people
          .map((person, index) => (people.length === 1 || person.includeFollowUp ? index : -1))
          .filter((index) => index >= 0);
        if (followUpIndexes.length === 0) {
          return res.status(422).json({
            code: 'review',
            error: 'Escolha quem entra no acompanhamento.',
            fields: { visitors: 'Escolha quem entra no acompanhamento.' },
          });
        }
        followUpAt = resolveNextContactAt(
          'tomorrow',
          undefined,
          captured,
          church.timezone || CHURCH_TIMEZONE
        ).date;
      }
    }

    if (requestId) {
      const replayed = await Visitor.exists({ churchId, requestId });
      if (replayed) {
        return res.status(201).json({ success: true, linked: true, message: 'Cadastro já registrado' });
      }
    }

    const serviceId = await linkedServiceId(device.churchId, captured);
    const origin = { deviceId: device.deviceId, name: device.deviceName };

    const created = await Visitor.insertMany(
      people.map((visitor, index) => ({
        churchId: device.churchId,
        name: visitor.name,
        relationship: visitor.relationship,
        city: visitor.city,
        panelObservation: visitor.panelObservation,
        showObservationOnPanel: visitor.showObservationOnPanel,
        visitKind: visitor.visitKind,
        visitDate: captured,
        capturedAt: captured,
        source: 'portaria_device' as const,
        portariaDevice: origin,
        ...(serviceId ? { serviceId } : {}),
        ...(index === 0 && requestId ? { requestId } : {}),
      }))
    );

    if (followUpAt && followUpIndexes.length > 0) {
      for (const index of followUpIndexes) {
        const visitor = created[index];
        if (!visitor) continue;
        await createFollowUpRecord({
          churchId: device.churchId,
          visitorId: visitor._id,
          phone: followUpPhone,
          nextContactAt: followUpAt,
          consent: true,
          source: 'portaria_device',
        });
      }
    }

    await markPortariaDeviceUsed(device).catch(() => undefined);
    return res.status(201).json({
      success: true,
      linked: Boolean(serviceId),
      message: serviceId ? 'Cadastro enviado' : 'Cadastro enviado sem culto associado',
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      return res.status(201).json({ success: true, linked: true, message: 'Cadastro já registrado' });
    }
    return res.status(500).json({ error: 'Não foi possível registrar os visitantes.' });
  }
}

export async function createPortariaVehicleNotice(req: PortariaDeviceRequest, res: Response) {
  try {
    if (rejectsClientChurchId(req.body)) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    }
    if (rejectsClientServiceId(req.body)) {
      return res.status(400).json({ error: 'O culto não pode ser escolhido neste envio.' });
    }

    const body =
      req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const plate = parseVehiclePlate(typeof body.plate === 'string' ? body.plate : '');
    if (!plate) {
      return res.status(422).json({
        code: 'review',
        error: 'Confira a placa do veículo.',
        fields: { plate: 'Confira a placa do veículo.' },
      });
    }

    const vehicleModel = normalizeSingleLine(body.vehicleModel, 120);
    const requestedAction = body.requestedAction;
    const otherDescription =
      typeof body.otherDescription === 'string'
        ? body.otherDescription.trim().replace(/\s+/g, ' ').slice(0, MAX_OTHER_DESCRIPTION)
        : '';
    const detailsRaw = typeof body.details === 'string' ? body.details.trim() : '';
    const details = detailsRaw.slice(0, MAX_DETAILS_LENGTH);
    const requestId = parseRequestId(body.requestId);

    if (!vehicleModel || !isVehicleNoticeAction(requestedAction)) {
      return res.status(422).json({
        code: 'review',
        error: 'Revise o modelo e a ação solicitada.',
        fields: { vehicleModel: 'Revise o modelo e a ação solicitada.' },
      });
    }
    if (requestedAction === 'other' && !otherDescription) {
      return res.status(422).json({
        code: 'review',
        error: 'Descreva o que precisa ser feito.',
        fields: { otherDescription: 'Descreva o que precisa ser feito.' },
      });
    }
    if (detailsRaw.length > MAX_DETAILS_LENGTH) {
      return res.status(422).json({
        code: 'review',
        error: 'A observação está muito longa.',
        fields: { details: 'A observação está muito longa.' },
      });
    }

    const captured = parseCapturedAt(body.capturedAt);
    if ('error' in captured) {
      return res.status(422).json({
        code: 'review',
        error: captured.error,
        fields: { capturedAt: captured.error },
      });
    }

    const device = req.portariaDevice!;
    const churchId = new Types.ObjectId(device.churchId);

    if (requestId) {
      const replayed = await VehicleNotice.exists({ churchId, requestId });
      if (replayed) {
        return res.status(201).json({ success: true, linked: true, message: 'Aviso já registrado' });
      }
    }

    const serviceId = await linkedServiceId(device.churchId, captured);

    await VehicleNotice.create({
      churchId,
      plate: plate.plate,
      plateNormalized: plate.plateNormalized,
      vehicleModel,
      requestedAction,
      otherDescription,
      details,
      requestId,
      capturedAt: captured,
      serviceId,
      status: 'pending',
      source: 'portaria_device',
      portariaDevice: { deviceId: device.deviceId, name: device.deviceName },
      archived: false,
    });

    await markPortariaDeviceUsed(device).catch(() => undefined);
    return res.status(201).json({
      success: true,
      linked: Boolean(serviceId),
      message: serviceId ? 'Aviso enviado' : 'Aviso enviado sem culto associado',
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      return res.status(201).json({ success: true, linked: true, message: 'Aviso já registrado' });
    }
    return res.status(500).json({ error: 'Não foi possível enviar o aviso.' });
  }
}

router.get('/pairings/:token', inspectPortariaPairing);
router.post('/pairings/:token/claim', claimPortariaPairing);
router.get('/device', requirePortariaDevice(), getPortariaDevice);
router.post('/visitors', requirePortariaDevice('offline_visitors:create'), createPortariaVisitors);
router.post(
  '/vehicle-notices',
  requirePortariaDevice('offline_vehicle_notices:create'),
  createPortariaVehicleNotice
);

export default router;
