import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface ParsedGuestToken {
  publicId: string;
  signature: string;
}

export function getGuestAccessSecret(): string {
  const secret = process.env.GUEST_ACCESS_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('GUEST_ACCESS_SECRET deve possuir pelo menos 32 caracteres');
  }
  if (secret === process.env.JWT_SECRET) {
    throw new Error('GUEST_ACCESS_SECRET deve ser diferente de JWT_SECRET');
  }
  return secret;
}

export function createGuestPublicId(): string {
  return randomBytes(24).toString('base64url');
}

function signatureFor(publicId: string, version: number): Buffer {
  return createHmac('sha256', getGuestAccessSecret())
    .update(`${publicId}.${version}`)
    .digest();
}

export function createGuestToken(publicId: string, version: number): string {
  if (!PUBLIC_ID_PATTERN.test(publicId) || !Number.isSafeInteger(version) || version < 1) {
    throw new Error('Dados inválidos para gerar o acesso convidado');
  }

  return `${publicId}.${signatureFor(publicId, version).toString('base64url')}`;
}

export function parseGuestToken(token: unknown): ParsedGuestToken | null {
  if (typeof token !== 'string' || token.length !== 76) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [publicId, signature] = parts;
  if (!PUBLIC_ID_PATTERN.test(publicId) || !SIGNATURE_PATTERN.test(signature)) return null;
  return { publicId, signature };
}

export function verifyGuestTokenSignature(
  parsed: ParsedGuestToken,
  version: number
): boolean {
  if (!Number.isSafeInteger(version) || version < 1) return false;

  try {
    const received = Buffer.from(parsed.signature, 'base64url');
    const expected = signatureFor(parsed.publicId, version);
    return received.length === expected.length && timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

export function opaqueRateLimitKey(
  kind: string,
  identity: string,
  windowStart: number,
  secret = getGuestAccessSecret()
): string {
  return createHmac('sha256', secret)
    .update(`${kind}:${identity}:${windowStart}`)
    .digest('hex');
}
