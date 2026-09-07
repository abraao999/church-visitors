import type { NextFunction, Request, Response } from 'express';
import {
  GuestAccess,
  type GuestAccessType,
} from '../models/GuestAccess.js';
import { Church } from '../models/Church.js';
import { guestAccessHasScope, resolveGuestAccessTypes } from '../utils/guestAccessTypes.js';
import { getGuestAccessSecret, parseGuestToken, verifyGuestTokenSignature } from '../utils/guestToken.js';
import { clientIp, consumeRateLimit, sendRateLimited } from '../utils/rateLimit.js';

/**
 * Teto por IP aplicado antes de validar o token, só para barrar varredura de
 * links. Precisa ser alto para não punir uma igreja inteira atrás do mesmo IP.
 */
const PROBE_LIMIT = 300;

/** Limite de uso legítimo, contado por igreja para que uma não afete a outra. */
const READ_LIMIT = 120;
const WRITE_LIMIT = 40;

export interface GuestAccessContext {
  churchId: string;
  churchName: string;
  guestAccessId: string;
  accessName: string;
  scope: GuestAccessType;
  scopes: GuestAccessType[];
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
}

export interface GuestAccessRequest extends Request {
  guestAccess?: GuestAccessContext;
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
      const ip = clientIp(req);
      const requestLimit = req.method === 'GET' ? READ_LIMIT : WRITE_LIMIT;
      const secret = getGuestAccessSecret();
      if (!(await consumeRateLimit(secret, 'ip', ip, PROBE_LIMIT))) {
        return sendRateLimited(res, {
          valid: false,
          error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        });
      }

      const parsed = parseGuestToken(req.params.token);
      if (!parsed) return rejectInvalid(res);

      const access = await GuestAccess.findOne({ publicId: parsed.publicId })
        .select('churchId name publicId type types version active expiresAt')
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

      const scopes = resolveGuestAccessTypes(access);
      if (scopes.length === 0) {
        return res.status(410).json({
          valid: false,
          error: 'Este acesso não está ativo. Solicite um novo QR Code ao responsável pela igreja.',
        });
      }

      if (requiredScope && !guestAccessHasScope(access, requiredScope)) {
        return res.status(403).json({
          valid: false,
          error: 'Esta opção não está disponível neste acesso.',
        });
      }

      const churchKey = `${String(access.churchId)}|${ip}`;
      if (!(await consumeRateLimit(secret, 'church-ip', churchKey, requestLimit))) {
        return sendRateLimited(res, {
          valid: false,
          error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        });
      }

      if (!(await consumeRateLimit(secret, 'access', String(access._id), requestLimit))) {
        return sendRateLimited(res, {
          valid: false,
          error: 'Este acesso recebeu muitos envios. Aguarde alguns minutos.',
        });
      }

      const church = await Church.findOne({ _id: access.churchId, active: true })
        .select('name branding.logoUrl branding.primaryColor branding.accentColor')
        .lean();
      if (!church) return rejectInvalid(res);

      const scope = requiredScope && scopes.includes(requiredScope) ? requiredScope : scopes[0];
      const branding = church.branding || {};

      req.guestAccess = {
        churchId: String(access.churchId),
        churchName: church.name,
        guestAccessId: String(access._id),
        accessName: access.name,
        scope,
        scopes,
        ...(branding.logoUrl ? { logoUrl: branding.logoUrl } : {}),
        ...(branding.primaryColor ? { primaryColor: branding.primaryColor } : {}),
        ...(branding.accentColor ? { accentColor: branding.accentColor } : {}),
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
