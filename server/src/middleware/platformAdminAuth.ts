import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { PlatformAdmin, type PlatformAdminRole } from '../models/PlatformAdmin.js';
import { requireConfiguredSecret } from '../utils/configuredSecret.js';
import { parseCookieHeader } from '../utils/sessionCookie.js';
import { PLATFORM_ADMIN_COOKIE } from '../utils/platformAdminSession.js';

export const PLATFORM_ADMIN_JWT_ISSUER = 'eclesiafy-platform-admin';
export const PLATFORM_ADMIN_JWT_AUDIENCE = 'eclesiafy-system-admin';

export const PLATFORM_ADMIN_JWT_SECRET_HELP =
  'Falta configurar PLATFORM_ADMIN_JWT_SECRET no servidor (.env ou variáveis da Vercel). ' +
  'Use uma chave com pelo menos 32 caracteres, diferente de JWT_SECRET, GUEST_ACCESS_SECRET e EMAIL_TOKEN_SECRET.';

export interface PlatformAdminContext {
  adminId: string;
  name: string;
  email: string;
  role: PlatformAdminRole;
  tokenVersion: number;
}

export interface PlatformAdminRequest extends Request {
  platformAdmin?: PlatformAdminContext;
}

export function getPlatformAdminJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = requireConfiguredSecret('PLATFORM_ADMIN_JWT_SECRET', env.PLATFORM_ADMIN_JWT_SECRET);
  if (secret === env.JWT_SECRET) {
    throw new Error('PLATFORM_ADMIN_JWT_SECRET deve ser diferente de JWT_SECRET');
  }
  if (secret === env.GUEST_ACCESS_SECRET) {
    throw new Error('PLATFORM_ADMIN_JWT_SECRET deve ser diferente de GUEST_ACCESS_SECRET');
  }
  if (secret === env.EMAIL_TOKEN_SECRET) {
    throw new Error('PLATFORM_ADMIN_JWT_SECRET deve ser diferente de EMAIL_TOKEN_SECRET');
  }
  return secret;
}

export function isPlatformAdminJwtSecretError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('PLATFORM_ADMIN_JWT_SECRET');
}

export function signPlatformAdminToken(admin: PlatformAdminContext): string {
  return jwt.sign(
    {
      sub: admin.adminId,
      role: admin.role,
      name: admin.name,
      email: admin.email,
      tv: admin.tokenVersion,
    },
    getPlatformAdminJwtSecret(),
    {
      expiresIn: '7d',
      algorithm: 'HS256',
      issuer: PLATFORM_ADMIN_JWT_ISSUER,
      audience: PLATFORM_ADMIN_JWT_AUDIENCE,
    }
  );
}

export function readPlatformAdminToken(req: { headers?: { cookie?: string } }): string | undefined {
  return parseCookieHeader(req.headers?.cookie)[PLATFORM_ADMIN_COOKIE] || undefined;
}

export function canPlatformAdminWrite(role: PlatformAdminRole): boolean {
  return role === 'platform_owner' || role === 'support';
}

export function canPlatformAdminManageChurch(role: PlatformAdminRole): boolean {
  return role === 'platform_owner';
}

export async function requirePlatformAdmin(
  req: PlatformAdminRequest,
  res: Response,
  next: NextFunction
) {
  let secret: string;
  try {
    secret = getPlatformAdminJwtSecret();
  } catch {
    return res.status(503).json({ error: PLATFORM_ADMIN_JWT_SECRET_HELP });
  }

  const token = readPlatformAdminToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Sessão administrativa expirada. Entre novamente.' });
  }

  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: PLATFORM_ADMIN_JWT_ISSUER,
      audience: PLATFORM_ADMIN_JWT_AUDIENCE,
    }) as { sub?: string; tv?: number };

    if (!payload.sub || !Types.ObjectId.isValid(payload.sub)) {
      return res.status(401).json({ error: 'Sessão administrativa expirada. Entre novamente.' });
    }

    const admin = await PlatformAdmin.findById(payload.sub, 'name email role active tokenVersion');
    if (!admin || admin.active === false) {
      return res.status(401).json({ error: 'Sessão administrativa expirada. Entre novamente.' });
    }
    if ((payload.tv ?? 0) !== (admin.tokenVersion ?? 0)) {
      return res.status(401).json({ error: 'Sessão administrativa expirada. Entre novamente.' });
    }

    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    req.platformAdmin = {
      adminId: String(admin._id),
      name: admin.name,
      email: admin.email,
      role: admin.role,
      tokenVersion: admin.tokenVersion ?? 0,
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'Sessão administrativa expirada. Entre novamente.' });
  }
}

export function requirePlatformRole(...roles: PlatformAdminRole[]) {
  return (req: PlatformAdminRequest, res: Response, next: NextFunction) => {
    const role = req.platformAdmin?.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ error: 'Você não tem permissão para esta ação.' });
    }
    return next();
  };
}
