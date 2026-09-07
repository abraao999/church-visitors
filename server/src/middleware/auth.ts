import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { User, type UserRole } from '../models/User.js';
import { readSessionToken } from '../utils/sessionCookie.js';

export interface AuthContext {
  userId: string;
  churchId: string;
  role: UserRole;
  name: string;
  email: string;
  tokenVersion?: number;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

const MIN_SECRET_LENGTH = 32;

export const JWT_SECRET_HELP =
  'Falta configurar JWT_SECRET no servidor (.env ou variáveis da Vercel). ' +
  'Use uma chave com pelo menos 32 caracteres e diferente do GUEST_ACCESS_SECRET.';

/**
 * Sem valor padrão: um segredo previsível permitiria assinar uma sessão para
 * qualquer igreja. A ausência da variável precisa interromper a operação.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET deve possuir pelo menos ${MIN_SECRET_LENGTH} caracteres`);
  }
  if (secret === process.env.GUEST_ACCESS_SECRET) {
    throw new Error('JWT_SECRET deve ser diferente de GUEST_ACCESS_SECRET');
  }
  return secret;
}

export function isJwtSecretError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('JWT_SECRET');
}

export function signToken(auth: AuthContext): string {
  return jwt.sign(
    {
      sub: auth.userId,
      churchId: auth.churchId,
      role: auth.role,
      name: auth.name,
      email: auth.email,
      tv: auth.tokenVersion ?? 0,
    },
    getJwtSecret(),
    { expiresIn: '7d', algorithm: 'HS256' }
  );
}

export async function revokeAuthTokens(userId: string, churchId: string): Promise<void> {
  await User.updateOne({ _id: userId, churchId }, { $inc: { tokenVersion: 1 } });
}

export function toActor(auth: AuthContext) {
  return {
    userId: new Types.ObjectId(auth.userId),
    churchId: new Types.ObjectId(auth.churchId),
    name: auth.name,
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  let secret: string;
  try {
    secret = getJwtSecret();
  } catch {
    return res.status(503).json({ error: JWT_SECRET_HELP });
  }

  const token = readSessionToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Faça login para continuar' });
  }

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as {
      sub: string;
      churchId: string;
      role: UserRole;
      name: string;
      email: string;
      tv?: number;
    };

    if (
      !Types.ObjectId.isValid(payload.sub) ||
      !Types.ObjectId.isValid(payload.churchId) ||
      payload.role !== 'owner'
    ) {
      throw new Error('Token sem contexto de tenant');
    }

    // O JWT identifica a sessão, mas o banco confirma o vínculo atual. Assim,
    // alterar uma claim ou reutilizar um token após a igreja ser desativada não
    // concede acesso.
    const user = await User.findOne({
      _id: payload.sub,
      churchId: payload.churchId,
      role: payload.role,
    }).select('name email churchId role tokenVersion');

    const tokenVersion = typeof payload.tv === 'number' ? payload.tv : 0;
    if ((user?.tokenVersion ?? 0) !== tokenVersion) {
      throw new Error('Sessão encerrada');
    }

    if (!user?.churchId) {
      throw new Error('Usuário sem vínculo ativo');
    }

    const churchIsActive = await Church.exists({ _id: user.churchId, active: true });
    if (!churchIsActive) {
      throw new Error('Igreja inativa');
    }

    req.auth = {
      userId: String(user._id),
      churchId: String(user.churchId),
      role: user.role,
      name: user.name,
      email: user.email,
    };
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie, Authorization');
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
  }
}
