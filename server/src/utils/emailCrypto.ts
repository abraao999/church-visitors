import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { getEmailTokenSecret } from './emailConfig.js';

export type EmailTokenPurpose = 'email_verify' | 'email_code' | 'password_reset';

export function createOpaqueId(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

export function createHighEntropyToken(): string {
  return randomBytes(32).toString('base64url');
}

export function createVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hmacEmailSecret(purpose: EmailTokenPurpose, value: string, secret = getEmailTokenSecret()): string {
  return createHmac('sha256', secret).update(`${purpose}:${value}`).digest('hex');
}

export function hashVerificationToken(token: string, secret = getEmailTokenSecret()): string {
  return hmacEmailSecret('email_verify', token, secret);
}

export function hashVerificationCode(
  challengeId: string,
  code: string,
  secret = getEmailTokenSecret()
): string {
  return hmacEmailSecret('email_code', `${challengeId}:${code}`, secret);
}

export function hashPasswordResetToken(token: string, secret = getEmailTokenSecret()): string {
  return hmacEmailSecret('password_reset', token, secret);
}

export function secretsMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const domainParts = domain.split('.');
  const name = domainParts[0] || '*';
  const rest = domainParts.slice(1).join('.');
  const domainMask = `${name[0] || '*'}***${rest ? `.${rest}` : ''}`;
  return `${local[0]}***@${domainMask}`;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
