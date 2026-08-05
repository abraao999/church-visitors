import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function toActor(user: AuthUser) {
  return {
    userId: new Types.ObjectId(user.id),
    name: user.name,
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Faça login para continuar' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      name: string;
      email: string;
    };

    req.user = {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
  }
}

/** Exige auth, exceto quando o body.source for "live". */
export function requireAuthUnlessLive(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (req.body?.source === 'live') {
    return next();
  }
  return requireAuth(req, res, next);
}
