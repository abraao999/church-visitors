import { requireConfiguredSecret } from './configuredSecret.js';

export const DEFAULT_EMAIL_FROM = 'Eclesiafy <acesso@notificacoes.eclesiafy.com.br>';
export const DEFAULT_VERIFICATION_TTL_MINUTES = 30;
export const DEFAULT_PASSWORD_RESET_TTL_MINUTES = 30;
export const DEFAULT_RESEND_INTERVAL_SECONDS = 60;
export const DEFAULT_CODE_MAX_ATTEMPTS = 5;

export const EMAIL_TOKEN_SECRET_HELP =
  'Falta configurar EMAIL_TOKEN_SECRET no servidor (.env ou variáveis da Vercel). ' +
  'Use uma chave com pelo menos 32 caracteres, diferente de JWT_SECRET, GUEST_ACCESS_SECRET e CRON_SECRET.';

const BLOCKED_PRODUCTION_HOST =
  /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$|\.vercel\.app$/i;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getEmailTokenSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = requireConfiguredSecret('EMAIL_TOKEN_SECRET', env.EMAIL_TOKEN_SECRET);
  if (secret === env.JWT_SECRET) {
    throw new Error('EMAIL_TOKEN_SECRET deve ser diferente de JWT_SECRET');
  }
  if (secret === env.GUEST_ACCESS_SECRET) {
    throw new Error('EMAIL_TOKEN_SECRET deve ser diferente de GUEST_ACCESS_SECRET');
  }
  if (env.CRON_SECRET && secret === env.CRON_SECRET) {
    throw new Error('EMAIL_TOKEN_SECRET deve ser diferente de CRON_SECRET');
  }
  return secret;
}

export function isEmailTokenSecretError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('EMAIL_TOKEN_SECRET');
}

export function getEmailFrom(): string {
  const from = (process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM).trim();
  return from || DEFAULT_EMAIL_FROM;
}

export function getEmailReplyTo(): string | undefined {
  const replyTo = (process.env.EMAIL_REPLY_TO || '').trim();
  return replyTo || undefined;
}

export function getVerificationTtlMs(): number {
  return (
    positiveInt(process.env.EMAIL_VERIFICATION_TTL_MINUTES, DEFAULT_VERIFICATION_TTL_MINUTES) *
    60 *
    1000
  );
}

export function getPasswordResetTtlMs(): number {
  return (
    positiveInt(process.env.PASSWORD_RESET_TTL_MINUTES, DEFAULT_PASSWORD_RESET_TTL_MINUTES) *
    60 *
    1000
  );
}

export function getResendIntervalMs(): number {
  return (
    positiveInt(process.env.EMAIL_RESEND_INTERVAL_SECONDS, DEFAULT_RESEND_INTERVAL_SECONDS) * 1000
  );
}

export function getCodeMaxAttempts(): number {
  return positiveInt(process.env.EMAIL_CODE_MAX_ATTEMPTS, DEFAULT_CODE_MAX_ATTEMPTS);
}

export function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production' || env.VERCEL === '1';
}

/** Origem pública usada só nos links de e-mail. Nunca usa Host nem VERCEL_URL. */
export function getPublicAppOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.APP_ORIGIN || '').trim().replace(/\/$/, '');
  if (!raw) {
    if (isProductionRuntime(env)) {
      throw new Error('APP_ORIGIN deve apontar para o domínio público da aplicação');
    }
    return 'http://localhost:5173';
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('APP_ORIGIN deve ser uma URL absoluta válida');
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('APP_ORIGIN não deve incluir credenciais, consulta ou fragmento');
  }

  if (parsed.pathname && parsed.pathname !== '/') {
    throw new Error('APP_ORIGIN deve ser somente a origem, sem caminho');
  }

  const host = parsed.hostname.toLowerCase();
  if (isProductionRuntime(env)) {
    if (parsed.protocol !== 'https:') {
      throw new Error('APP_ORIGIN deve usar HTTPS em produção');
    }
    if (BLOCKED_PRODUCTION_HOST.test(host)) {
      throw new Error('APP_ORIGIN não pode apontar para localhost nem para o domínio temporário da Vercel');
    }
  } else if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('APP_ORIGIN deve usar HTTP ou HTTPS');
  }

  return `${parsed.protocol}//${parsed.host}`;
}

export function buildEmailActionLink(path: string, token: string, env: NodeJS.ProcessEnv = process.env): string {
  const origin = getPublicAppOrigin(env);
  return `${origin}${path}#token=${token}`;
}
