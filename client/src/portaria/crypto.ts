const IV_BYTES = 12;

export function webCryptoAvailable(): boolean {
  return Boolean(globalThis.crypto?.subtle);
}

export async function createQueueKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptPayload(
  key: CryptoKey,
  payload: unknown
): Promise<{ iv: ArrayBuffer; data: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return { iv: iv.buffer, data };
}

export async function decryptPayload<T>(
  key: CryptoKey,
  iv: ArrayBuffer,
  data: ArrayBuffer
): Promise<T> {
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, data);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
