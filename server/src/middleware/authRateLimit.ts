import type { NextFunction, Request, Response } from 'express';
import { getJwtSecret } from './auth.js';
import { clientIp, consumeRateLimit, sendRateLimited } from '../utils/rateLimit.js';
import { readLoginIdentifier } from '../utils/loginIdentifier.js';

/** Por IP: várias pessoas na mesma rede da igreja ainda conseguem entrar. */
export const LOGIN_IP_LIMIT = 20;
/** Por usuário/e-mail: impede força bruta distribuída contra uma conta. */
export const LOGIN_ID_LIMIT = 10;
/** Cadastro é raro; o teto por IP barra criação em massa. */
export const REGISTER_IP_LIMIT = 10;

const AUTH_LIMIT_MESSAGE =
  'Muitas tentativas. Aguarde alguns minutos e tente novamente.';

export function requireAuthRateLimit(action: 'login' | 'register') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const secret = getJwtSecret();
      const ip = clientIp(req);

      if (action === 'register') {
        if (!(await consumeRateLimit(secret, 'auth-register-ip', ip, REGISTER_IP_LIMIT))) {
          return sendRateLimited(res, { error: AUTH_LIMIT_MESSAGE });
        }
        return next();
      }

      if (!(await consumeRateLimit(secret, 'auth-login-ip', ip, LOGIN_IP_LIMIT))) {
        return sendRateLimited(res, { error: AUTH_LIMIT_MESSAGE });
      }

      const login = readLoginIdentifier(
        req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : undefined
      );
      if (login && !(await consumeRateLimit(secret, 'auth-login-id', login, LOGIN_ID_LIMIT))) {
        return sendRateLimited(res, { error: AUTH_LIMIT_MESSAGE });
      }

      next();
    } catch (error) {
      if (error instanceof Error && error.message.includes('JWT_SECRET')) {
        return next();
      }
      return res.status(503).json({
        error: 'Não foi possível validar agora. Tente novamente em instantes.',
      });
    }
  };
}