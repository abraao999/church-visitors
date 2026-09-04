import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { User, type UserRole } from '../models/User.js';

export interface AuthContext {
  userId: string;
  churchId: string;
  role: UserRole;
  name: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(auth: AuthContext): string {
  return jwt.sign(
    {
      sub: auth.userId,
      churchId: auth.churchId,
      role: auth.role,
      name: auth.name,
      email: auth.email,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
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
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Faça login para continuar' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      churchId: string;
      role: UserRole;
      name: string;
      email: string;
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
    }).select('name email churchId role');

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
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
  }
}
