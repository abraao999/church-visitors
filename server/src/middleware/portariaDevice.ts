import type { NextFunction, Request, Response } from 'express';
import { Church } from '../models/Church.js';
import { PortariaDevice } from '../models/PortariaDevice.js';
import { getGuestAccessSecret } from '../utils/guestToken.js';
import { clientIp, consumeRateLimit, sendRateLimited } from '../utils/rateLimit.js';
import {
  parsePortariaToken,
  PORTARIA_WRITE_LIMIT,
  type PortariaDevicePermission,
  verifyPortariaDeviceSignature,
} from '../utils/portariaToken.js';

const PROBE_LIMIT = 300;
const READ_LIMIT = 120;

export interface PortariaDeviceContext {
  churchId: string;
  churchName: string;
  deviceId: string;
  deviceName: string;
  publicId: string;
  permissions: PortariaDevicePermission[];
  visitorFollowUpEnabled?: boolean;
  timezone?: string;
}

export interface PortariaDeviceRequest extends Request {
  portariaDevice?: PortariaDeviceContext;
}

function credentialFrom(req: Request): unknown {
  const header = req.get('authorization');
  if (header && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return req.get('x-portaria-credential');
}

function rejectInvalid(res: Response) {
  return res.status(404).json({
    valid: false,
    code: 'invalid',
    error: 'Este aparelho não está preparado. Solicite um novo pareamento.',
  });
}

export function requirePortariaDevice(requiredPermission?: PortariaDevicePermission) {
  return async (req: PortariaDeviceRequest, res: Response, next: NextFunction) => {
    try {
      res.setHeader('Cache-Control', 'private, no-store');
      const ip = clientIp(req);
      const secret = getGuestAccessSecret();
      if (!(await consumeRateLimit(secret, 'ip', ip, PROBE_LIMIT))) {
        return sendRateLimited(res, {
          valid: false,
          error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        });
      }

      const parsed = parsePortariaToken(credentialFrom(req));
      if (!parsed) return rejectInvalid(res);

      const device = await PortariaDevice.findOne({ publicId: parsed.publicId })
        .select(
          'churchId name publicId credentialVersion permissions active revokedAt'
        )
        .lean();

      if (!device || !verifyPortariaDeviceSignature(parsed, device.credentialVersion)) {
        return rejectInvalid(res);
      }

      if (!device.active || device.revokedAt) {
        return res.status(410).json({
          valid: false,
          code: 'revoked',
          error: 'Este aparelho não possui mais acesso.',
        });
      }

      if (requiredPermission && !device.permissions.includes(requiredPermission)) {
        return res.status(403).json({
          valid: false,
          code: 'forbidden',
          error: 'Esta opção não está liberada neste aparelho.',
        });
      }

      const limit = req.method === 'GET' ? READ_LIMIT : PORTARIA_WRITE_LIMIT;
      const churchKey = `${String(device.churchId)}|${ip}`;
      if (!(await consumeRateLimit(secret, 'church-ip', churchKey, limit))) {
        return sendRateLimited(res, {
          valid: false,
          error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        });
      }
      if (!(await consumeRateLimit(secret, 'portaria-device', String(device._id), limit))) {
        return sendRateLimited(res, {
          valid: false,
          error: 'Este aparelho enviou muitos cadastros. Aguarde alguns minutos.',
        });
      }

      const church = await Church.findOne({ _id: device.churchId, active: true })
        .select('name timezone visitorFollowUpEnabled')
        .lean();
      if (!church) return rejectInvalid(res);

      req.portariaDevice = {
        churchId: String(device.churchId),
        churchName: church.name,
        deviceId: String(device._id),
        deviceName: device.name,
        publicId: device.publicId,
        permissions: device.permissions,
        visitorFollowUpEnabled: church.visitorFollowUpEnabled === true,
        timezone: church.timezone,
      };
      next();
    } catch {
      return res.status(503).json({
        valid: false,
        error: 'Não foi possível validar este aparelho agora. Tente novamente em instantes.',
      });
    }
  };
}

export async function markPortariaDeviceUsed(context: PortariaDeviceContext): Promise<void> {
  await PortariaDevice.updateOne(
    { _id: context.deviceId, churchId: context.churchId, active: true },
    { $set: { lastUsedAt: new Date() } }
  );
}
