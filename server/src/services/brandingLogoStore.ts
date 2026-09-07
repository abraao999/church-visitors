import { randomBytes } from 'crypto';
import { del, put } from '@vercel/blob';
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
}

function opaqueLogoKey(churchId: string, contentType: LogoImageType): string {
  return `church-branding/${churchId}/${randomBytes(16).toString('hex')}.${logoExtension(contentType)}`;
}

const vercelStore: BrandingLogoStore = {
  async put(input) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error('BLOB_UNAVAILABLE');
    }
    const key = opaqueLogoKey(input.churchId, input.contentType);
    const blob = await put(key, input.buffer, {
      access: 'public',
      addRandomSuffix: false,
      contentType: input.contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return { url: blob.url, key };
  },
  async delete(key) {
    if (!key || !process.env.BLOB_READ_WRITE_TOKEN) return;
    await del(key, { token: process.env.BLOB_READ_WRITE_TOKEN });
  },
};

let store: BrandingLogoStore = vercelStore;

export function getBrandingLogoStore(): BrandingLogoStore {
  return store;
}

export function setBrandingLogoStoreForTests(next: BrandingLogoStore | null): void {
  store = next || vercelStore;
}

export function createMemoryLogoStore(): BrandingLogoStore & {
  files: Map<string, { url: string; deleted: boolean }>;
  events: string[];
} {
  const files = new Map<string, { url: string; deleted: boolean }>();
  const events: string[] = [];
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
      events.push(`delete:${key}`);
      const existing = files.get(key);
      if (existing) existing.deleted = true;
    },
  };
}
