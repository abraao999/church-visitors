import type { NextFunction, Request, Response } from 'express';
import { getJwtSecret } from './auth.js';
import { clientIp, consumeRateLimit, DAY_WINDOW_MS, sendRateLimited } from '../utils/rateLimit.js';
import { readLoginIdentifier } from '../utils/loginIdentifier.js';

/** Por IP: várias pessoas na mesma rede da igreja ainda conseguem entrar. */
export const LOGIN_IP_LIMIT = 20;
/** Por usuário/e-mail: impede força bruta distribuída contra uma conta. */
export const LOGIN_ID_LIMIT = 10;
/** Cadastro é raro; o teto por IP barra criação em massa. */
export const REGISTER_IP_LIMIT = 10;
export const EMAIL_CONFIRM_IP_LIMIT = 30;
export const EMAIL_CONFIRM_ID_LIMIT = 15;
export const EMAIL_RESEND_IP_LIMIT = 10;
export const EMAIL_RESEND_ID_LIMIT = 5;
export const PASSWORD_FORGOT_IP_LIMIT = 8;
export const PASSWORD_FORGOT_EMAIL_LIMIT = 3;
export const PASSWORD_FORGOT_IP_DAILY_LIMIT = 20;
export const PASSWORD_FORGOT_EMAIL_DAILY_LIMIT = 5;
export const PASSWORD_RESET_IP_LIMIT = 20;

const AUTH_LIMIT_MESSAGE =
  'Muitas tentativas. Aguarde alguns minutos e tente novamente.';

type AuthRateAction =
  | 'login'
  | 'register'
  | 'email-confirm'
  | 'email-resend'
  | 'password-forgot'
  | 'password-reset';

function readOpaqueId(body: Record<string, unknown> | undefined): string {
  const challengeId = typeof body?.challengeId === 'string' ? body.challengeId.trim() : '';
  return challengeId;
}

function readEmailIdentity(body: Record<string, unknown> | undefined): string {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  return email;
}

export function requireAuthRateLimit(action: AuthRateAction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const secret = getJwtSecret();
      const ip = clientIp(req);
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : undefined;

      if (action === 'register') {
        if (!(await consumeRateLimit(secret, 'auth-register-ip', ip, REGISTER_IP_LIMIT))) {
          return sendRateLimited(res, { error: AUTH_LIMIT_MESSAGE });
        }
        return next();
      }

      if (action === 'login') {
        if (!(await consumeRateLimit(secret, 'auth-login-ip', ip, LOGIN_IP_LIMIT))) {
          return sendRateLimited(res, { error: AUTH_LIMIT_MESSAGE });
        }

        const login = readLoginIdentifier(body);
        if (login && !(await consumeRateLimit(secret, 'auth-login-id', login, LOGIN_ID_LIMIT))) {
          return sendRateLimited(res, { error: AUTH_LIMIT_MESSAGE });
        }
        return next();
      }

      if (action === 'email-confirm') {
        if (!(await consumeRateLimit(secret, 'auth-email-confirm-ip', ip, EMAIL_CONFIRM_IP_LIMIT))) {
          return sendRateLimited(res, { error: AUTH_LIMIT_MESSAGE });
        }
        const challengeId = readOpaqueId(body);
        if (
          challengeId &&
          !(await consumeRateLimit(secret, 'auth-email-confirm-id', challengeId, EMAIL_CONFIRM_ID_LIMIT))
        ) {
          return sendRateLimited(res, { error: AUTH_LIMIT_MESSAGE });
        }
        return next();
      }

      if (action === 'email-resend') {
        if (!(await consumeRateLimit(secret, 'auth-email-resend-ip', ip, EMAIL_RESEND_IP_LIMIT))) {
          return sendRateLimited(res, { error: AUTH_LIMIT_MESSAGE });
        }
        const challengeId = readOpaqueId(body);
        if (
          challengeId &&
          !(await consumeRateLimit(secret, 'auth-email-resend-id', challengeId, EMAIL_RESEND_ID_LIMIT))
        ) {
          return sendRateLimited(res, { error: AUTH_LIMIT_MESSAGE });
        }
        return next();
      }

      if (action === 'password-forgot') {
        if (
          !(await consumeRateLimit(secret, 'auth-forgot-ip', ip, PASSWORD_FORGOT_IP_LIMIT)) ||
          !(await consumeRateLimit(
            secret,
            'auth-forgot-ip-day',
            ip,
            PASSWORD_FORGOT_IP_DAILY_LIMIT,
            DAY_WINDOW_MS
          ))
        ) {
          return sendRateLimited(res, { error: AUTH_LIMIT_MESSAGE });
        }
        const email = readEmailIdentity(body);
        if (
          email &&
          (!(await consumeRateLimit(secret, 'auth-forgot-email', email, PASSWORD_FORGOT_EMAIL_LIMIT)) ||
            !(await consumeRateLimit(
              secret,
              'auth-forgot-email-day',
              email,
              PASSWORD_FORGOT_EMAIL_DAILY_LIMIT,
              DAY_WINDOW_MS
            )))
        ) {
          return sendRateLimited(res, { error: AUTH_LIMIT_MESSAGE });
        }
        return next();
      }

      if (!(await consumeRateLimit(secret, 'auth-reset-ip', ip, PASSWORD_RESET_IP_LIMIT))) {
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