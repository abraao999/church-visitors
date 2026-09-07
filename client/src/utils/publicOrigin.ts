/**
 * Origem usada nos links e QR Codes. Sem domínio fixo no código: em produção
 * vale o endereço da janela; em desenvolvimento, localhost não deve ir para
 * o material impresso.
 */

export function isLocalOrigin(origin: string): boolean {
  const host = hostnameOf(origin);
  if (!host) return true;
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    return true;
  }
  if (/^10(?:\.\d{1,3}){3}$/.test(host)) return true;
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(host)) return true;
  if (/^169\.254(?:\.\d{1,3}){2}$/.test(host)) return true;
  return false;
}

export function resolvePublicOrigin(
  currentOrigin: string,
  configuredOrigin?: string
): { origin: string; local: boolean } {
  const configured = configuredOrigin?.trim().replace(/\/$/, '');
  const origin = (configured || currentOrigin).replace(/\/$/, '');
  return { origin, local: isLocalOrigin(origin) };
}

function hostnameOf(origin: string): string | null {
  try {
    const value = origin.includes('://') ? origin : `http://${origin}`;
    return new URL(value).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return null;
  }
}
