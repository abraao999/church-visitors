import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getGuestAccessSecret } from './guestToken.js';

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const PORTARIA_DEVICE_PERMISSIONS = [
  'offline_visitors:create',
  'offline_vehicle_notices:create',
] as const;

export type PortariaDevicePermission = (typeof PORTARIA_DEVICE_PERMISSIONS)[number];

export const PAIRING_TTL_MS = 15 * 60 * 1000;
export const CAPTURED_AT_MAX_FUTURE_MS = 15 * 60 * 1000;
export const CAPTURED_AT_MAX_PAST_MS = 8 * 24 * 60 * 60 * 1000;
export const PORTARIA_WRITE_LIMIT = 40;

export interface ParsedPortariaToken {
  publicId: string;
  signature: string;
}

function secret(): string {
  return getGuestAccessSecret();
}

function signatureFor(kind: 'device' | 'pairing', publicId: string, version: number): Buffer {
  return createHmac('sha256', secret())
    .update(`portaria-${kind}.${publicId}.${version}`)
    .digest();
}

export function createPortariaPublicId(): string {
  return randomBytes(24).toString('base64url');
}

export function createPortariaDeviceToken(publicId: string, version: number): string {
  if (!PUBLIC_ID_PATTERN.test(publicId) || !Number.isSafeInteger(version) || version < 1) {
    throw new Error('Dados inválidos para gerar a credencial do aparelho');
  }
  return `${publicId}.${signatureFor('device', publicId, version).toString('base64url')}`;
}

export function createPortariaPairingToken(publicId: string): string {
  if (!PUBLIC_ID_PATTERN.test(publicId)) {
    throw new Error('Dados inválidos para gerar o convite de pareamento');
  }
  return `${publicId}.${signatureFor('pairing', publicId, 1).toString('base64url')}`;
}

export function parsePortariaToken(token: unknown): ParsedPortariaToken | null {
  if (typeof token !== 'string' || token.length !== 76) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [publicId, signature] = parts;
  if (!PUBLIC_ID_PATTERN.test(publicId) || !SIGNATURE_PATTERN.test(signature)) return null;
  return { publicId, signature };
}

export function verifyPortariaDeviceSignature(
  parsed: ParsedPortariaToken,
  version: number
): boolean {
  return verifySignature('device', parsed, version);
}

export function verifyPortariaPairingSignature(parsed: ParsedPortariaToken): boolean {
  return verifySignature('pairing', parsed, 1);
}

function verifySignature(
  kind: 'device' | 'pairing',
  parsed: ParsedPortariaToken,
  version: number
): boolean {
  if (!Number.isSafeInteger(version) || version < 1) return false;
  try {
    const received = Buffer.from(parsed.signature, 'base64url');
    const expected = signatureFor(kind, parsed.publicId, version);
    return received.length === expected.length && timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

export function parsePortariaPermissions(value: unknown): PortariaDevicePermission[] {
  if (!Array.isArray(value)) return [];
  const unique: PortariaDevicePermission[] = [];
  for (const item of value) {
    if (
      item === 'offline_visitors:create' ||
      item === 'offline_vehicle_notices:create'
    ) {
      if (!unique.includes(item)) unique.push(item);
    }
  }
  return unique;
}

export function parseCapturedAt(value: unknown, now = new Date()): Date | { error: string } {
  if (typeof value !== 'string' || !value.trim()) {
    return { error: 'Informe o horário em que o cadastro foi preenchido.' };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { error: 'O horário do cadastro é inválido.' };
  }
  const delta = date.getTime() - now.getTime();
  if (delta > CAPTURED_AT_MAX_FUTURE_MS) {
    return { error: 'O horário do cadastro está adiantado demais. Revise o relógio do aparelho.' };
  }
  if (-delta > CAPTURED_AT_MAX_PAST_MS) {
    return { error: 'Este cadastro ficou guardado tempo demais. Peça ao responsável para revisá-lo.' };
  }
  return date;
}

export function parseRequestId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const requestId = value.trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) return undefined;
  return requestId;
}

export function normalizeDeviceName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  return name && name.length <= 80 ? name : null;
}

export function pairingExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + PAIRING_TTL_MS);
}
