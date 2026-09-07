import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';

const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3002',
  'http://127.0.0.1:3002',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

/**
 * Política do HTML e da API. O script do tema saiu do index.html para um
 * arquivo próprio, então não precisamos de script-src unsafe-inline.
 * connect-src libera o Holyrics local no PC da igreja (sync pelo navegador).
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' http://127.0.0.1:* http://localhost:* http://[::1]:*",
].join('; ');

function splitOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function httpsOrigin(host: string | undefined): string | undefined {
  if (!host) return undefined;
  const trimmed = host.trim().replace(/\/$/, '');
  if (!trimmed) return undefined;
  return trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`;
}

export function allowedCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const origins = new Set<string>();

  for (const origin of splitOrigins(env.APP_ORIGIN || env.CORS_ORIGIN)) {
    origins.add(origin);
  }

  const vercelHost = httpsOrigin(env.VERCEL_URL);
  if (vercelHost) origins.add(vercelHost);

  const productionHost = httpsOrigin(env.VERCEL_PROJECT_PRODUCTION_URL);
  if (productionHost) origins.add(productionHost);

  if (env.NODE_ENV !== 'production') {
    for (const origin of LOCAL_DEV_ORIGINS) origins.add(origin);
  }

  return [...origins];
}

export function isAllowedOrigin(
  origin: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return allowedCorsOrigins(env).includes(origin.replace(/\/$/, ''));
}

export function createCorsMiddleware() {
  return cors({
    origin(origin, callback) {
      // Sem Origin: mesma origem, curl, health check — não é um navegador cruzado.
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    maxAge: 600,
  });
}

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);

  const https =
    req.secure ||
    req.get('x-forwarded-proto') === 'https' ||
    process.env.VERCEL === '1';
  if (https) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'private, no-store');
  }

  next();
}
