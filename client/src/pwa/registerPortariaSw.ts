export interface PortariaSwApi {
  updateAvailable: boolean;
  applyUpdate: () => void;
  requestBackgroundSync: () => void;
}

export async function registerPortariaServiceWorker(
  onUpdate: (api: PortariaSwApi) => void
): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

  const applyUpdate = () => {
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
  };

  const notify = () => {
    if (registration.waiting) {
      onUpdate({
        updateAvailable: true,
        applyUpdate,
        requestBackgroundSync: () => {
          if ('sync' in registration) {
            const syncManager = (registration as ServiceWorkerRegistration & {
              sync?: { register: (tag: string) => Promise<void> };
            }).sync;
            void syncManager?.register('portaria-sync');
          }
        },
      });
    }
  };

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') notify();
    });
  });
  notify();

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (document.querySelector('form [data-dirty="true"]')) return;
    window.location.reload();
  });

  return registration;
}

export async function precacheReady(): Promise<boolean> {
  if (!('caches' in window) || !('serviceWorker' in navigator)) return false;
  await navigator.serviceWorker.ready;
  const keys = await caches.keys();
  const portaria = keys.find((key) => key.startsWith('portaria-'));
  if (!portaria) return false;
  const cache = await caches.open(portaria);
  const shell = await cache.match('/portaria');
  return Boolean(shell);
}
