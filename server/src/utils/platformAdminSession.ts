import type { CookieOptions, Response } from 'express';
import { sessionCookieOptions, sessionUsesHttps } from './sessionCookie.js';

export const PLATFORM_ADMIN_COOKIE = 'eclesiafy_admin_session';
export const PLATFORM_ADMIN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type CookieFlags = {
  secure?: boolean;
  get?: (name: string) => string | undefined;
};

function adminCookieOptions(req?: CookieFlags): CookieOptions {
  return {
    ...sessionCookieOptions(req),
    maxAge: PLATFORM_ADMIN_MAX_AGE_MS,
    secure: sessionUsesHttps(req),
  };
}

export function setPlatformAdminCookie(req: CookieFlags | undefined, res: Response, token: string): void {
  res.cookie(PLATFORM_ADMIN_COOKIE, token, adminCookieOptions(req));
}

export function clearPlatformAdminCookie(req: CookieFlags | undefined, res: Response): void {
  res.clearCookie(PLATFORM_ADMIN_COOKIE, {
    ...adminCookieOptions(req),
    maxAge: 0,
  });
}
