import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import {
  hasAnyPermission,
  hasPermission,
  type Permission,
} from '../utils/permissions.js';

export const FORBIDDEN_ERROR = 'Você não tem permissão para esta ação.';

export function requirePermission(...needed: Permission[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Faça login para continuar' });
    }
    if (needed.every((permission) => hasPermission(req.auth!.permissions, permission))) {
      return next();
    }
    return res.status(403).json({ error: FORBIDDEN_ERROR });
  };
}

export function requireAnyPermission(...needed: Permission[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Faça login para continuar' });
    }
    if (hasAnyPermission(req.auth.permissions, needed)) {
      return next();
    }
    return res.status(403).json({ error: FORBIDDEN_ERROR });
  };
}
