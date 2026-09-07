import type { CookieOptions, Response } from 'express';

export const SESSION_COOKIE = 'cv_session';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type CookieFlags = {
  secure?: boolean;
  get?: (name: string) => string | undefined;
};

export function sessionUsesHttps(req?: CookieFlags, env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    req?.secure || req?.get?.('x-forwarded-proto') === 'https' || env.VERCEL === '1'
  );
}

export function sessionCookieOptions(
  req?: CookieFlags,
  env: NodeJS.ProcessEnv = process.env
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
    secure: sessionUsesHttps(req, env),
  };
}

export function parseCookieHeader(header?: string): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      cookies[name] = part.slice(separator + 1).trim();
    }
  }
  return cookies;
}

export function readBearerToken(header?: string): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice(7).trim();
  return token || undefined;
}

export function readSessionToken(req: {
  headers?: { cookie?: string; authorization?: string };
}): string | undefined {
  const fromCookie = parseCookieHeader(req.headers?.cookie)[SESSION_COOKIE];
  if (fromCookie) return fromCookie;
  return readBearerToken(req.headers?.authorization);
}

export function setSessionCookie(req: CookieFlags | undefined, res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(req));
}

export function clearSessionCookie(req: CookieFlags | undefined, res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    ...sessionCookieOptions(req),
    maxAge: 0,
  });
}
