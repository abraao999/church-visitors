export const QUEUE_FORMAT_VERSION = 1;
export const MAX_PENDING = 100;
export const WARN_PENDING = 80;
export const MAX_VISITORS = 10;
export const STALE_DAYS = 7;
export const SYNC_INTERVAL_MS = 30_000;
export const MAX_BACKOFF_MS = 5 * 60_000;
export const DB_NAME = 'church-visitors-portaria';
export const DB_VERSION = 1;
export const PORTARIA_START_URL = '/portaria';

export const OFFLINE_PERMISSIONS = [
  'offline_visitors:create',
  'offline_vehicle_notices:create',
] as const;

export function nextBackoffMs(attemptCount: number): number {
  const step = Math.min(MAX_BACKOFF_MS, 2000 * 2 ** Math.max(0, attemptCount - 1));
  return step;
}

export function queueCapacity(pendingCount: number): 'ok' | 'warn' | 'full' {
  if (pendingCount >= MAX_PENDING) return 'full';
  if (pendingCount >= WARN_PENDING) return 'warn';
  return 'ok';
}

export function isStaleQueue(oldestCreatedAt: string | undefined, now = Date.now()): boolean {
  if (!oldestCreatedAt) return false;
  const created = new Date(oldestCreatedAt).getTime();
  if (Number.isNaN(created)) return false;
  return now - created >= STALE_DAYS * 24 * 60 * 60_000;
}

export function portariaPairingUrl(token: string, origin = window.location.origin): string {
  return `${origin.replace(/\/$/, '')}${PORTARIA_START_URL}?parear=${encodeURIComponent(token)}`;
}
