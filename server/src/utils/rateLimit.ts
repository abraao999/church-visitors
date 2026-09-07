import type { Request, Response } from 'express';
import { PublicRateLimit } from '../models/PublicRateLimit.js';
import { opaqueRateLimitKey } from './guestToken.js';

export const RATE_WINDOW_MS = 15 * 60 * 1000;

export function clientIp(req: Pick<Request, 'ip' | 'socket'>): string {
  return req.ip || req.socket.remoteAddress || 'desconhecido';
}

export async function consumeRateLimit(
  secret: string,
  kind: string,
  identity: string,
  limit: number
): Promise<boolean> {
  const now = Date.now();
  const windowStart = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  const bucketId = opaqueRateLimitKey(kind, identity, windowStart, secret);
  const bucket = await PublicRateLimit.findOneAndUpdate(
    { _id: bucketId },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(windowStart + RATE_WINDOW_MS * 2) },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return Boolean(bucket && bucket.count <= limit);
}

export function sendRateLimited(res: Response, body: Record<string, unknown>): Response {
  res.setHeader('Retry-After', String(RATE_WINDOW_MS / 1000));
  return res.status(429).json(body);
}