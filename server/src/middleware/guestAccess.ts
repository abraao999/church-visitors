import type { NextFunction, Request, Response } from 'express';
import { GuestAccess, type GuestAccessType } from '../models/GuestAccess.js';
import { Church } from '../models/Church.js';
import { PublicRateLimit } from '../models/PublicRateLimit.js';
import {
  opaqueRateLimitKey,
  parseGuestToken,
  verifyGuestTokenSignature,
} from '../utils/guestToken.js';

const RATE_WINDOW_MS = 15 * 60 * 1000;

export interface GuestAccessContext {
  churchId: string;
  churchName: string;
  guestAccessId: string;
  accessName: string;
  scope: GuestAccessType;
}

export interface GuestAccessRequest extends Request {
  guestAccess?: GuestAccessContext;
}

async function consumeRateLimit(
  kind: 'ip' | 'access',
  identity: string,
  limit: number
): Promise<boolean> {
  const now = Date.now();
  const windowStart = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  const bucketId = opaqueRateLimitKey(kind, identity, windowStart);
  const bucket = await PublicRateLimit.findOneAndUpdate(
    { _id: bucketId },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(windowStart + RATE_WINDOW_MS * 2) },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return Boolean(bucket && bucket.count <= limit);
}

function rejectInvalid(res: Response) {
  return res.status(404).json({
    valid: false,
    error: 'Este acesso não é válido. Solicite um novo link à sua igreja.',
  });
}

export function requireGuestAccess(requiredScope?: GuestAccessType) {
  return async (req: GuestAccessRequest, res: Response, next: NextFunction) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'desconhecido';
      const requestLimit = req.method === 'GET' ? 120 : 40;
      if (!(await consumeRateLimit('ip', ip, requestLimit))) {
        res.setHeader('Retry-After', String(RATE_WINDOW_MS / 1000));
        return res.status(429).json({
          valid: false,
          error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        });
      }

      const parsed = parseGuestToken(req.params.token);
      if (!parsed) return rejectInvalid(res);

      const access = await GuestAccess.findOne({ publicId: parsed.publicId })
        .select('churchId name publicId type version active expiresAt')
        .lean();

      if (!access || !verifyGuestTokenSignature(parsed, access.version)) {
        return rejectInvalid(res);
      }

      if (!access.active) {
        return res.status(410).json({
          valid: false,
          error: 'Este acesso foi desativado. Solicite um novo link à sua igreja.',
        });
      }

      if (access.expiresAt && access.expiresAt.getTime() <= Date.now()) {
        return res.status(410).json({
          valid: false,
          error: 'Este acesso expirou. Solicite um novo link à sua igreja.',
        });
      }

      if (requiredScope && access.type !== requiredScope) {
        return res.status(403).json({
          valid: false,
          error: 'Este acesso não permite realizar esta ação.',
        });
      }

      if (!(await consumeRateLimit('access', String(access._id), requestLimit))) {
        res.setHeader('Retry-After', String(RATE_WINDOW_MS / 1000));
        return res.status(429).json({
          valid: false,
          error: 'Este acesso recebeu muitos envios. Aguarde alguns minutos.',
        });
      }

      const church = await Church.findOne({ _id: access.churchId, active: true })
        .select('name')
        .lean();
      if (!church) return rejectInvalid(res);

      req.guestAccess = {
        churchId: String(access.churchId),
        churchName: church.name,
        guestAccessId: String(access._id),
        accessName: access.name,
        scope: access.type,
      };
      next();
    } catch {
      return res.status(503).json({
        valid: false,
        error: 'Não foi possível validar este acesso agora. Tente novamente em instantes.',
      });
    }
  };
}

export async function markGuestAccessUsed(context: GuestAccessContext): Promise<void> {
  await GuestAccess.updateOne(
    { _id: context.guestAccessId, churchId: context.churchId },
    { $set: { lastUsedAt: new Date() } }
  );
}
