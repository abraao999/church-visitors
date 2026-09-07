import type { Plugin } from 'vite';

const DEFAULT_PRECACHE = [
  '/portaria',
  '/index.html',
  '/manifest.webmanifest',
  '/theme-init.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

export function renderServiceWorker(input: { version: string; precache: string[] }): string {
  const precache = JSON.stringify([...new Set(input.precache)]);
  return `const CACHE_NAME = ${JSON.stringify(input.version)};
const PRECACHE = ${precache};

function cachePolicy(url, method) {
  if (method !== 'GET') return 'network-only';
  if (url.pathname.startsWith('/api/')) return 'network-only';
  if (url.searchParams.has('parear')) return 'network-only';
  if (url.pathname.startsWith('/assets/')) return 'cache-first';
  if (/\\.(?:js|css|woff2?|png|svg|webmanifest|ico)$/.test(url.pathname)) return 'cache-first';
  if (url.pathname === '/theme-init.js' || url.pathname.startsWith('/icons/')) return 'cache-first';
  if (url.pathname === '/portaria' || url.pathname.startsWith('/portaria/')) return 'network-first-nav';
  return 'network-only';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => {
      if (!self.registration.active) self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'portaria-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'PORTARIA_SYNC' }));
      })
    );
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const policy = cachePolicy(url, request.method);
  if (policy === 'network-only') return;
  if (policy === 'cache-first') {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }))
    );
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/portaria', copy));
        }
        return response;
      })
      .catch(() => caches.match('/portaria').then((cached) => cached || caches.match('/index.html')))
  );
});
`;
}

export function portariaSwPlugin(): Plugin {
  return {
    name: 'portaria-sw',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] === '/sw.js') {
          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(renderServiceWorker({ version: 'portaria-dev', precache: DEFAULT_PRECACHE }));
          return;
        }
        next();
      });
    },
    generateBundle(_, bundle) {
      const precache = new Set(DEFAULT_PRECACHE);
      for (const name of Object.keys(bundle)) {
        if (name.endsWith('.map') || name === 'sw.js') continue;
        precache.add(`/${name.replace(/\\/g, '/')}`);
      }
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: renderServiceWorker({
          version: `portaria-${Date.now()}`,
          precache: [...precache],
        }),
      });
    },
  };
}
