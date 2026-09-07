import { Router, type Response } from 'express';
import { requireAuth, toActor, type AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PortariaDevice } from '../models/PortariaDevice.js';
import { PortariaPairing } from '../models/PortariaPairing.js';
import { tenantRecordFilter, withChurch } from '../utils/tenant.js';
import {
  createPortariaPairingToken,
  createPortariaPublicId,
  normalizeDeviceName,
  pairingExpiresAt,
} from '../utils/portariaToken.js';

const router = Router();

router.use(requireAuth);
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});

function pairingUrl(token: string): string {
  const origin = (process.env.APP_ORIGIN || '').replace(/\/$/, '');
  const path = `/portaria?parear=${encodeURIComponent(token)}`;
  return origin ? `${origin}${path}` : path;
}

function serializeDevice(device: {
  _id: unknown;
  name: string;
  publicId: string;
  permissions: string[];
  active: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
  revokedAt?: Date;
}) {
  return {
    id: String(device._id),
    name: device.name,
    publicId: device.publicId,
    permissions: device.permissions,
    active: device.active,
    lastUsedAt: device.lastUsedAt,
    createdAt: device.createdAt,
    revokedAt: device.revokedAt,
  };
}

export async function listPortariaDevices(req: AuthenticatedRequest, res: Response) {
  const devices = await PortariaDevice.find(withChurch(req.auth!.churchId, {}))
    .sort({ active: -1, createdAt: -1 })
    .lean();
  return res.json(devices.map(serializeDevice));
}

export async function createPortariaPairing(req: AuthenticatedRequest, res: Response) {
  const publicId = createPortariaPublicId();
  const pairing = await PortariaPairing.create({
    churchId: req.auth!.churchId,
    publicId,
    createdBy: toActor(req.auth!),
    expiresAt: pairingExpiresAt(),
  });
  const token = createPortariaPairingToken(publicId);
  return res.status(201).json({
    id: String(pairing._id),
    expiresAt: pairing.expiresAt,
    url: pairingUrl(token),
    token,
  });
}

export async function renamePortariaDevice(req: AuthenticatedRequest, res: Response) {
  const name = normalizeDeviceName(req.body?.name);
  if (!name) {
    return res.status(400).json({ error: 'Informe um nome com até 80 caracteres.' });
  }

  const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
  if (!filter) {
    return res.status(404).json({ error: 'Aparelho não encontrado.' });
  }
  const device = await PortariaDevice.findOneAndUpdate(filter, { $set: { name } }, { new: true });
  if (!device) {
    return res.status(404).json({ error: 'Aparelho não encontrado.' });
  }
  return res.json(serializeDevice(device));
}

export async function revokePortariaDevice(req: AuthenticatedRequest, res: Response) {
  const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
  if (!filter) {
    return res.status(404).json({ error: 'Aparelho não encontrado ou já desativado.' });
  }
  const device = await PortariaDevice.findOneAndUpdate(
    { ...filter, active: true },
    {
      $set: {
        active: false,
        revokedAt: new Date(),
        revokedBy: toActor(req.auth!),
      },
    },
    { new: true }
  );
  if (!device) {
    return res.status(404).json({ error: 'Aparelho não encontrado ou já desativado.' });
  }
  return res.json(serializeDevice(device));
}

router.get('/', requirePermission('guest_accesses:read'), listPortariaDevices);
router.post('/pairings', requirePermission('guest_accesses:create'), createPortariaPairing);
router.patch('/:id', requirePermission('guest_accesses:update'), renamePortariaDevice);
router.post('/:id/revoke', requirePermission('guest_accesses:revoke'), revokePortariaDevice);

export default router;
