import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getGuestAccessSecret } from './guestToken.js';

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface ParsedInviteToken {
  publicId: string;
  signature: string;
}

function hmacKey(): string {
  return getGuestAccessSecret();
}

function signatureFor(publicId: string, version: number, churchId: string): Buffer {
  return createHmac('sha256', hmacKey())
    .update(`team-invite:${publicId}.${version}.${churchId}`)
    .digest();
}

export function createInvitePublicId(): string {
  return randomBytes(24).toString('base64url');
}

export function createInviteToken(publicId: string, version: number, churchId: string): string {
  if (!PUBLIC_ID_PATTERN.test(publicId) || !Number.isSafeInteger(version) || version < 1) {
    throw new Error('Dados inválidos para gerar o convite');
  }
  return `${publicId}.${signatureFor(publicId, version, churchId).toString('base64url')}`;
}

export function parseInviteToken(token: unknown): ParsedInviteToken | null {
  if (typeof token !== 'string' || token.length !== 76) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [publicId, signature] = parts;
  if (!PUBLIC_ID_PATTERN.test(publicId) || !SIGNATURE_PATTERN.test(signature)) return null;
  return { publicId, signature };
}

export function verifyInviteToken(
  parsed: ParsedInviteToken,
  version: number,
  churchId: string
): boolean {
  if (!Number.isSafeInteger(version) || version < 1) return false;
  try {
    const received = Buffer.from(parsed.signature, 'base64url');
    const expected = signatureFor(parsed.publicId, version, churchId);
    return received.length === expected.length && timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

export function invitePath(token: string): string {
  return `/convite/${token}`;
}
