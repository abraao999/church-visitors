import type { ClockOffset } from './types';

export function clockOffsetFrom(serverTime: string, localNow = Date.now()): ClockOffset {
  const server = new Date(serverTime).getTime();
  const safeServer = Number.isNaN(server) ? localNow : server;
  return {
    offsetMs: safeServer - localNow,
    serverTime,
    localTime: new Date(localNow).toISOString(),
  };
}

export function capturedAtFrom(offset: ClockOffset | null, localNow = Date.now()): string {
  return new Date(localNow + (offset?.offsetMs ?? 0)).toISOString();
}
