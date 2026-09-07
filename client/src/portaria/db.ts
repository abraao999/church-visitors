import { DB_NAME, DB_VERSION, QUEUE_FORMAT_VERSION } from './constants';
import { createQueueKey } from './crypto';
import type { ClockOffset, DeviceCredential, QueueItemRecord } from './types';

const META_CREDENTIAL = 'credential';
const META_CLOCK = 'clock';
const META_FORMAT = 'formatVersion';
const KEY_NAME = 'queue';

interface PortariaDb {
  db: IDBDatabase;
  key: CryptoKey;
}

let opened: Promise<PortariaDb> | null = null;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys');
      if (!db.objectStoreNames.contains('queue')) {
        const queue = db.createObjectStore('queue', { keyPath: 'localId' });
        queue.createIndex('status', 'status');
        queue.createIndex('createdAt', 'createdAt');
        queue.createIndex('device', 'churchDevicePublicId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function ensureKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await requestToPromise(
    db.transaction('keys', 'readonly').objectStore('keys').get(KEY_NAME)
  );
  if (existing) return existing as CryptoKey;
  const key = await createQueueKey();
  await requestToPromise(db.transaction('keys', 'readwrite').objectStore('keys').put(key, KEY_NAME));
  return key;
}

async function migrate(db: IDBDatabase): Promise<void> {
  const current = await requestToPromise(
    db.transaction('meta', 'readonly').objectStore('meta').get(META_FORMAT)
  );
  const version = typeof current === 'number' ? current : 0;
  if (version >= QUEUE_FORMAT_VERSION) return;
  await requestToPromise(
    db.transaction('meta', 'readwrite').objectStore('meta').put(QUEUE_FORMAT_VERSION, META_FORMAT)
  );
}

export async function openPortariaDb(): Promise<PortariaDb> {
  if (!opened) {
    opened = (async () => {
      const db = await openDatabase();
      await migrate(db);
      const key = await ensureKey(db);
      return { db, key };
    })();
  }
  return opened;
}

export function resetPortariaDbCache(): void {
  opened = null;
}

async function openMetaDb(): Promise<IDBDatabase> {
  return openDatabase();
}

export async function readCredential(): Promise<DeviceCredential | null> {
  const db = await openMetaDb();
  const value = await requestToPromise(
    db.transaction('meta', 'readonly').objectStore('meta').get(META_CREDENTIAL)
  );
  return value && typeof value === 'object' ? (value as DeviceCredential) : null;
}

export async function writeCredential(credential: DeviceCredential): Promise<void> {
  const { db } = await openPortariaDb();
  await requestToPromise(
    db.transaction('meta', 'readwrite').objectStore('meta').put(credential, META_CREDENTIAL)
  );
}

export async function clearCredential(): Promise<void> {
  const { db } = await openPortariaDb();
  await requestToPromise(
    db.transaction('meta', 'readwrite').objectStore('meta').delete(META_CREDENTIAL)
  );
}

export async function readClockOffset(): Promise<ClockOffset | null> {
  const { db } = await openPortariaDb();
  const value = await requestToPromise(
    db.transaction('meta', 'readonly').objectStore('meta').get(META_CLOCK)
  );
  return value && typeof value === 'object' ? (value as ClockOffset) : null;
}

export async function writeClockOffset(offset: ClockOffset): Promise<void> {
  const { db } = await openPortariaDb();
  await requestToPromise(
    db.transaction('meta', 'readwrite').objectStore('meta').put(offset, META_CLOCK)
  );
}

export async function listQueue(publicId: string): Promise<QueueItemRecord[]> {
  const { db } = await openPortariaDb();
  const items = (await requestToPromise(
    db.transaction('queue', 'readonly').objectStore('queue').getAll()
  )) as QueueItemRecord[];
  return items
    .filter((item) => item.churchDevicePublicId === publicId && item.status !== 'sent')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function putQueueItem(item: QueueItemRecord): Promise<void> {
  const { db } = await openPortariaDb();
  await requestToPromise(db.transaction('queue', 'readwrite').objectStore('queue').put(item));
}

export async function deleteQueueItem(localId: string): Promise<void> {
  const { db } = await openPortariaDb();
  await requestToPromise(db.transaction('queue', 'readwrite').objectStore('queue').delete(localId));
}

export async function clearOtherDeviceQueues(publicId: string): Promise<void> {
  const { db } = await openPortariaDb();
  const tx = db.transaction('queue', 'readwrite');
  const store = tx.objectStore('queue');
  const items = (await requestToPromise(store.getAll())) as QueueItemRecord[];
  await Promise.all(
    items
      .filter((item) => item.churchDevicePublicId !== publicId)
      .map((item) => requestToPromise(store.delete(item.localId)))
  );
}

export async function wipePortariaData(): Promise<void> {
  const { db } = await openPortariaDb();
  await Promise.all([
    requestToPromise(db.transaction('queue', 'readwrite').objectStore('queue').clear()),
    requestToPromise(db.transaction('meta', 'readwrite').objectStore('meta').clear()),
    requestToPromise(db.transaction('keys', 'readwrite').objectStore('keys').clear()),
  ]);
  resetPortariaDbCache();
}

export async function queueKey(): Promise<CryptoKey> {
  const openedDb = await openPortariaDb();
  return openedDb.key;
}
