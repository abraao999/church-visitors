import { webCryptoAvailable } from './crypto';

export function isTrustedOrigin(origin = window.location.origin): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.protocol === 'https:') return true;
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  } catch {
    return false;
  }
}

export function indexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function offlineSupport(): { ok: true } | { ok: false; reason: string } {
  if (!isTrustedOrigin()) {
    return {
      ok: false,
      reason: 'O modo offline só funciona em conexão segura (HTTPS) ou em localhost.',
    };
  }
  if (!indexedDbAvailable() || !webCryptoAvailable()) {
    return {
      ok: false,
      reason:
        'Este navegador não oferece o armazenamento seguro necessário. Use o cadastro somente com internet.',
    };
  }
  return { ok: true };
}

export function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

export function isIosDevice(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}
