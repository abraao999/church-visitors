export type CachePolicy = 'network-only' | 'cache-first' | 'network-first-nav';

export function cachePolicyFor(url: URL, method = 'GET'): CachePolicy {
  if (method.toUpperCase() !== 'GET') return 'network-only';
  if (url.pathname.startsWith('/api/')) return 'network-only';
  if (url.searchParams.has('parear')) return 'network-only';
  if (url.pathname.startsWith('/assets/')) return 'cache-first';
  if (/\.(?:js|css|woff2?|png|svg|webmanifest|ico)$/.test(url.pathname)) return 'cache-first';
  if (url.pathname === '/theme-init.js' || url.pathname.startsWith('/icons/')) return 'cache-first';
  if (url.pathname === '/portaria' || url.pathname.startsWith('/portaria/')) {
    return 'network-first-nav';
  }
  return 'network-only';
}

export function navigationCacheKey(url: URL): string {
  return url.pathname === '/portaria' || url.pathname.startsWith('/portaria/')
    ? '/portaria'
    : url.pathname;
}
