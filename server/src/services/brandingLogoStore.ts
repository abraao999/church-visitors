import { randomBytes } from 'crypto';
import { del, list, put } from '@vercel/blob';
import { logoExtension, type LogoImageType } from '../utils/branding.js';

export interface BrandingLogoPut {
  churchId: string;
  buffer: Buffer;
  contentType: LogoImageType;
}

export interface BrandingLogoStored {
  url: string;
  key: string;
}

export interface BrandingLogoStore {
  put(input: BrandingLogoPut): Promise<BrandingLogoStored>;
  delete(key: string): Promise<void>;
  deleteUnused(churchId: string, keepKey?: string): Promise<void>;
}

export function churchLogoPrefix(churchId: string): string | null {
  const id = String(churchId || '').trim();
  if (!/^[a-fA-F0-9]{24}$/.test(id)) return null;
  return `church-branding/${id}/`;
}

function opaqueLogoKey(churchId: string, contentType: LogoImageType): string {
  return `church-branding/${churchId}/${randomBytes(16).toString('hex')}.${logoExtension(contentType)}`;
}

function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

async function listChurchLogoRefs(prefix: string): Promise<Array<{ url: string; pathname: string }>> {
  const token = blobToken();
  if (!token) return [];
  const refs: Array<{ url: string; pathname: string }> = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, token });
    for (const blob of page.blobs) {
      refs.push({ url: blob.url, pathname: blob.pathname });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return refs;
}

const vercelStore: BrandingLogoStore = {
  async put(input) {
    const token = blobToken();
    if (!token) {
      throw new Error('BLOB_UNAVAILABLE');
    }
    const key = opaqueLogoKey(input.churchId, input.contentType);
    const blob = await put(key, input.buffer, {
      access: 'public',
      addRandomSuffix: false,
      contentType: input.contentType,
      token,
    });
    return { url: blob.url, key: blob.pathname || key };
  },
  async delete(key) {
    const token = blobToken();
    if (!key || !token) return;
    await del(key, { token });
  },
  async deleteUnused(churchId, keepKey) {
    const token = blobToken();
    const prefix = churchLogoPrefix(churchId);
    if (!token || !prefix) return;
    const unused = (await listChurchLogoRefs(prefix)).filter((blob) => blob.pathname !== keepKey);
    if (!unused.length) return;
    await del(
      unused.map((blob) => blob.url),
      { token }
    );
  },
};

let store: BrandingLogoStore = vercelStore;

export function getBrandingLogoStore(): BrandingLogoStore {
  return store;
}

export function setBrandingLogoStoreForTests(next: BrandingLogoStore | null): void {
  store = next || vercelStore;
}

export async function discardUnusedLogos(
  churchId: string,
  options: { keepKey?: string; previousKey?: string } = {}
): Promise<void> {
  const { keepKey, previousKey } = options;
  if (previousKey && previousKey !== keepKey) {
    await store.delete(previousKey).catch(() => undefined);
  }
  await store.deleteUnused(churchId, keepKey).catch(() => undefined);
}

export function createMemoryLogoStore(): BrandingLogoStore & {
  files: Map<string, { url: string; deleted: boolean }>;
  events: string[];
} {
  const files = new Map<string, { url: string; deleted: boolean }>();
  const events: string[] = [];

  function markDeleted(key: string) {
    events.push(`delete:${key}`);
    const existing = files.get(key);
    if (existing) existing.deleted = true;
  }

  return {
    files,
    events,
    async put(input) {
      const key = opaqueLogoKey(input.churchId, input.contentType);
      const url = `https://blob.test/${key}`;
      files.set(key, { url, deleted: false });
      events.push(`put:${key}`);
      return { url, key };
    },
    async delete(key) {
      markDeleted(key);
    },
    async deleteUnused(churchId, keepKey) {
      const prefix = churchLogoPrefix(churchId);
      if (!prefix) return;
      for (const key of files.keys()) {
        if (!key.startsWith(prefix) || key === keepKey) continue;
        markDeleted(key);
      }
    },
  };
}
