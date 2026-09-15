import { Types, type ClientSession } from 'mongoose';
import {
  PLATFORM_CLOSED_MESSAGE_MAX,
  PLATFORM_CLOSED_MESSAGE_MIN,
  PLATFORM_LEGAL_URL_MAX,
  PLATFORM_LIMIT_CHURCHES_MAX,
  PLATFORM_LIMIT_CHURCHES_MIN,
  PLATFORM_LIMIT_PENDING_MAX,
  PLATFORM_LIMIT_PENDING_MIN,
  PLATFORM_MAINTENANCE_MESSAGE_MAX,
  PLATFORM_MAINTENANCE_MESSAGE_MIN,
  PLATFORM_MAINTENANCE_WINDOW_MAX,
  PLATFORM_MAINTENANCE_WINDOW_MAX_MS,
  PLATFORM_SENDER_ADDRESS_MAX,
  PLATFORM_SENDER_NAME_MAX,
  PLATFORM_SETTINGS_KEY,
  PLATFORM_TTL_RESET_MAX,
  PLATFORM_TTL_RESET_MIN,
  PLATFORM_TTL_RESEND_MAX,
  PLATFORM_TTL_RESEND_MIN,
  PLATFORM_TTL_VERIFICATION_MAX,
  PLATFORM_TTL_VERIFICATION_MIN,
  PlatformSettings,
  type IPlatformSettings,
  type PlatformApprovalMode,
  type PlatformNoticeTone,
  type PlatformRetentionDefaults,
} from '../models/PlatformSettings.js';
import { Church } from '../models/Church.js';
import { RETENTION_DEFAULTS, RetentionPolicy } from '../models/RetentionPolicy.js';
import {
  DEFAULT_EMAIL_FROM,
  DEFAULT_PASSWORD_RESET_TTL_MINUTES,
  DEFAULT_RESEND_INTERVAL_SECONDS,
  DEFAULT_VERIFICATION_TTL_MINUTES,
  getEmailFrom,
  getEmailReplyTo,
  getPasswordResetTtlMs,
  getPublicAppOrigin,
  getResendIntervalMs,
  getVerificationTtlMs,
  isBlockedProductionHost,
  isProductionRuntime,
} from '../utils/emailConfig.js';
import { isPlaceholderSecret } from '../utils/configuredSecret.js';
import { parseRetentionPolicy, type RetentionPolicyValues } from './retention.js';

export const REGISTRATIONS_CLOSED_ERROR = 'Novos cadastros estão temporariamente indisponíveis.';
export const REGISTRATIONS_CLOSED_CODE = 'registrations_closed';
export const PLATFORM_AT_CAPACITY_ERROR = 'A plataforma não está aceitando novos cadastros no momento.';
export const PLATFORM_AT_CAPACITY_CODE = 'platform_at_capacity';
export const REGISTRATION_PENDING_APPROVAL =
  'Seu e-mail foi confirmado. O cadastro aguarda aprovação da Eclesiafy.';
export const SETTINGS_CONFLICT_ERROR =
  'As configurações foram alteradas por outro administrador. Atualize a página antes de salvar.';
export const SETTINGS_UNKNOWN_ERROR = 'Propriedades desconhecidas não são aceitas.';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEADER_BREAK = /[\r\n\0]/;
const HTML_MARKUP = /[<>]/;

const ALLOWED_ROOT = new Set(['registrations', 'email', 'newChurchDefaults', 'maintenance', 'limits', 'legal', 'notice', 'updatedAt']);
const ALLOWED_REGISTRATIONS = new Set(['enabled', 'approvalMode', 'requireEmailConfirmation', 'closedMessage']);
const ALLOWED_EMAIL = new Set(['senderName', 'senderAddress', 'replyTo', 'ttl']);
const ALLOWED_EMAIL_TTL = new Set(['verificationMinutes', 'resetMinutes', 'resendSeconds']);
const ALLOWED_DEFAULTS = new Set(['timezone', 'visitorFollowUpEnabled', 'modules', 'retention']);
const ALLOWED_MODULES = new Set(['visitorFollowUpEnabled']);
const ALLOWED_RETENTION = new Set([
  'enabled',
  'visitorsMonths',
  'prayersDays',
  'vehicleNoticesDays',
  'guestAccessesDays',
  'teamInvitationsDays',
  'portariaDevicesDays',
]);
const ALLOWED_MAINTENANCE = new Set(['enabled', 'message', 'windows']);
const ALLOWED_WINDOW = new Set(['id', 'startsAt', 'endsAt', 'message']);
const ALLOWED_LIMITS = new Set(['maxChurches', 'maxPendingApprovals']);
const ALLOWED_LEGAL = new Set(['termsUrl', 'privacyUrl']);
const ALLOWED_NOTICE = new Set(['enabled', 'message', 'tone']);

export class PlatformSettingsError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = 'PlatformSettingsError';
    this.status = status;
    this.code = code;
  }
}

export type NewChurchCreationPlan = {
  approvalMode: PlatformApprovalMode;
  timezone: string;
  visitorFollowUpEnabled: boolean;
  retention: RetentionPolicyValues;
};

export type MaintenanceWindowView = {
  id: string;
  startsAt: string;
  endsAt: string;
  message: string;
};

export type EffectiveMaintenance = {
  enabled: boolean;
  message: string;
  source: 'off' | 'override' | 'window';
  windowId?: string;
  nextStartsAt?: string;
  nextEndsAt?: string;
};

export type PlatformEmailTtl = {
  verificationMinutes: number;
  resetMinutes: number;
  resendSeconds: number;
};

export type PlatformSettingsAdminView = {
  registrations: {
    enabled: boolean;
    requireEmailConfirmation: true;
    approvalMode: PlatformApprovalMode;
    closedMessage: string;
  };
  email: {
    senderName: string;
    senderAddress: string;
    replyTo: string;
    resendStatus: 'verified' | 'not_configured';
    appOrigin: string;
    ttl: PlatformEmailTtl;
  };
  newChurchDefaults: {
    timezone: string;
    visitorFollowUpEnabled: boolean;
    modules: {
      visitorFollowUpEnabled: boolean;
    };
    retention: PlatformRetentionDefaults;
  };
  maintenance: {
    enabled: boolean;
    message: string;
    windows: MaintenanceWindowView[];
    effective: EffectiveMaintenance;
  };
  limits: {
    maxChurches: number | null;
    maxPendingApprovals: number | null;
  };
  legal: {
    termsUrl: string;
    privacyUrl: string;
  };
  notice: {
    enabled: boolean;
    message: string;
    tone: PlatformNoticeTone;
  };
  updatedAt: string;
};

export type PlatformPublicStatus = {
  registrationsEnabled: boolean;
  closedMessage?: string;
  maintenance: {
    enabled: boolean;
    message: string;
  };
  legal?: {
    termsUrl?: string;
    privacyUrl?: string;
  };
  notice?: {
    enabled: true;
    message: string;
    tone: PlatformNoticeTone;
  };
};

export type EffectiveEmailTtl = {
  verificationMs: number;
  resetMs: number;
  resendMs: number;
};

export type EffectiveEmailDelivery = {
  from: string;
  replyTo?: string;
};

function supportedTimezones(): Set<string> {
  try {
    const values = (
      Intl as typeof Intl & { supportedValuesOf?(key: string): string[] }
    ).supportedValuesOf?.('timeZone');
    if (values?.length) return new Set(values);
  } catch {
    // Ambiente sem a lista IANA completa.
  }
  return new Set(['America/Sao_Paulo']);
}

export function isSupportedTimezone(value: string): boolean {
  return supportedTimezones().has(value);
}

export function sanitizeHeaderValue(value: string): string {
  return value.replace(HEADER_BREAK, ' ').replace(/\s+/g, ' ').trim();
}

export function parseEmailFromHeader(from: string): { name: string; address: string } {
  const trimmed = sanitizeHeaderValue(from || DEFAULT_EMAIL_FROM);
  const angled = trimmed.match(/^(.*)<([^>]+)>$/);
  if (angled) {
    const name = angled[1].replace(/^"|"$/g, '').trim() || 'Eclesiafy';
    return { name: name.slice(0, PLATFORM_SENDER_NAME_MAX), address: angled[2].trim() };
  }
  return { name: 'Eclesiafy', address: trimmed };
}

export function formatEmailFromHeader(name: string, address: string): string {
  return `${sanitizeHeaderValue(name)} <${sanitizeHeaderValue(address)}>`;
}

export function isAllowedSenderAddress(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  return domain === 'eclesiafy.com.br' || domain.endsWith('.eclesiafy.com.br');
}

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value) && !HEADER_BREAK.test(value);
}

function stripHtml(value: string): string {
  return sanitizeHeaderValue(value).replace(/<[^>]*>/g, '');
}

function defaultEmailFromEnv() {
  const parsed = parseEmailFromHeader(getEmailFrom());
  const replyTo = getEmailReplyTo() || '';
  return {
    senderName: parsed.name.slice(0, PLATFORM_SENDER_NAME_MAX) || 'Eclesiafy',
    senderAddress: parsed.address.slice(0, PLATFORM_SENDER_ADDRESS_MAX),
    replyTo: replyTo.slice(0, PLATFORM_SENDER_ADDRESS_MAX),
  };
}

function defaultEmailTtlFromEnv(): PlatformEmailTtl {
  return {
    verificationMinutes: Math.round(getVerificationTtlMs() / 60_000) || DEFAULT_VERIFICATION_TTL_MINUTES,
    resetMinutes: Math.round(getPasswordResetTtlMs() / 60_000) || DEFAULT_PASSWORD_RESET_TTL_MINUTES,
    resendSeconds: Math.round(getResendIntervalMs() / 1000) || DEFAULT_RESEND_INTERVAL_SECONDS,
  };
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function emailTtlValues(settings: IPlatformSettings | null): PlatformEmailTtl {
  const env = defaultEmailTtlFromEnv();
  const ttl = settings?.email?.ttl;
  return {
    verificationMinutes: inRange(ttl?.verificationMinutes, PLATFORM_TTL_VERIFICATION_MIN, PLATFORM_TTL_VERIFICATION_MAX)
      ? ttl.verificationMinutes
      : env.verificationMinutes,
    resetMinutes: inRange(ttl?.resetMinutes, PLATFORM_TTL_RESET_MIN, PLATFORM_TTL_RESET_MAX)
      ? ttl.resetMinutes
      : env.resetMinutes,
    resendSeconds: inRange(ttl?.resendSeconds, PLATFORM_TTL_RESEND_MIN, PLATFORM_TTL_RESEND_MAX)
      ? ttl.resendSeconds
      : env.resendSeconds,
  };
}

function limitValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

export function builtinPlatformDefaults() {
  const email = defaultEmailFromEnv();
  return {
    key: PLATFORM_SETTINGS_KEY,
    registrations: { enabled: true, approvalMode: 'automatic' as const, closedMessage: '' },
    email: { ...email, ttl: defaultEmailTtlFromEnv() },
    newChurchDefaults: {
      timezone: 'America/Sao_Paulo',
      visitorFollowUpEnabled: false,
      modules: { visitorFollowUpEnabled: false },
      retention: { enabled: false, ...RETENTION_DEFAULTS },
    },
    maintenance: { enabled: false, message: '', windows: [] },
    limits: { maxChurches: null as number | null, maxPendingApprovals: null as number | null },
    legal: { termsUrl: '', privacyUrl: '' },
    notice: { enabled: false, message: '', tone: 'info' as const },
  };
}

function followUpEnabled(settings: IPlatformSettings | null): boolean {
  return (
    settings?.newChurchDefaults?.visitorFollowUpEnabled === true ||
    settings?.newChurchDefaults?.modules?.visitorFollowUpEnabled === true
  );
}

function retentionValues(settings: IPlatformSettings | null): RetentionPolicyValues {
  const retention = settings?.newChurchDefaults?.retention;
  return {
    enabled: retention?.enabled === true,
    visitorsMonths: retention?.visitorsMonths ?? RETENTION_DEFAULTS.visitorsMonths,
    prayersDays: retention?.prayersDays ?? RETENTION_DEFAULTS.prayersDays,
    vehicleNoticesDays: retention?.vehicleNoticesDays ?? RETENTION_DEFAULTS.vehicleNoticesDays,
    guestAccessesDays: retention?.guestAccessesDays ?? RETENTION_DEFAULTS.guestAccessesDays,
    teamInvitationsDays: retention?.teamInvitationsDays ?? RETENTION_DEFAULTS.teamInvitationsDays,
    portariaDevicesDays: retention?.portariaDevicesDays ?? RETENTION_DEFAULTS.portariaDevicesDays,
  };
}

export async function getOrCreatePlatformSettings(): Promise<IPlatformSettings> {
  const defaults = builtinPlatformDefaults();
  const existing = await PlatformSettings.findOne({ key: PLATFORM_SETTINGS_KEY });
  if (existing) return existing;

  try {
    return await PlatformSettings.create(defaults);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const raced = await PlatformSettings.findOne({ key: PLATFORM_SETTINGS_KEY });
      if (raced) return raced;
    }
    throw error;
  }
}

export async function areRegistrationsEnabled(): Promise<boolean> {
  try {
    const settings = await getOrCreatePlatformSettings();
    return settings.registrations?.enabled !== false;
  } catch {
    return true;
  }
}

export async function getNewChurchCreationPlan(): Promise<NewChurchCreationPlan> {
  try {
    const settings = await getOrCreatePlatformSettings();
    const timezone = isSupportedTimezone(settings.newChurchDefaults?.timezone || '')
      ? settings.newChurchDefaults.timezone
      : 'America/Sao_Paulo';
    return {
      approvalMode: settings.registrations?.approvalMode === 'manual' ? 'manual' : 'automatic',
      timezone,
      visitorFollowUpEnabled: followUpEnabled(settings),
      retention: retentionValues(settings),
    };
  } catch {
    return {
      approvalMode: 'automatic',
      timezone: 'America/Sao_Paulo',
      visitorFollowUpEnabled: false,
      retention: { enabled: false, ...RETENTION_DEFAULTS },
    };
  }
}

export async function createRetentionPolicyForChurch(
  churchId: Types.ObjectId,
  retention: RetentionPolicyValues,
  session?: ClientSession
): Promise<void> {
  await RetentionPolicy.create(
    [
      {
        churchId,
        enabled: retention.enabled === true,
        visitorsMonths: retention.visitorsMonths,
        prayersDays: retention.prayersDays,
        vehicleNoticesDays: retention.vehicleNoticesDays,
        guestAccessesDays: retention.guestAccessesDays,
        teamInvitationsDays: retention.teamInvitationsDays,
        portariaDevicesDays: retention.portariaDevicesDays,
        ...(retention.enabled ? { activatedAt: new Date() } : {}),
      },
    ],
    session ? { session } : undefined
  );
}

function resendStatus(): 'verified' | 'not_configured' {
  const key = (process.env.RESEND_API_KEY || '').trim();
  if (!key || isPlaceholderSecret(key)) return 'not_configured';
  return 'verified';
}

function publicAppOrigin(): string {
  try {
    return getPublicAppOrigin();
  } catch {
    return '';
  }
}

function windowId(window: { _id?: unknown; id?: unknown }): string {
  if (window && typeof window === 'object' && '_id' in window && window._id) {
    return String(window._id);
  }
  if (window && typeof window === 'object' && 'id' in window && window.id) {
    return String(window.id);
  }
  return '';
}

function asDate(value: Date | string | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function listedWindows(
  settings: IPlatformSettings | null
): Array<{ id: string; startsAt: Date; endsAt: Date; message: string }> {
  const raw = settings?.maintenance?.windows;
  if (!raw || typeof raw !== 'object') return [];
  const list = Array.isArray(raw) ? raw : [];
  return list.flatMap((window) => {
    const startsAt = asDate(window?.startsAt);
    const endsAt = asDate(window?.endsAt);
    if (!startsAt || !endsAt) return [];
    return [{
      id: windowId(window),
      startsAt,
      endsAt,
      message: typeof window.message === 'string' ? window.message : '',
    }];
  });
}

export function resolveEffectiveMaintenance(
  settings: IPlatformSettings | null,
  now = new Date()
): EffectiveMaintenance {
  const defaultMessage = stripHtml(settings?.maintenance?.message || '');
  if (settings?.maintenance?.enabled === true) {
    return {
      enabled: true,
      message: defaultMessage,
      source: 'override',
    };
  }

  const windows = listedWindows(settings).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const current = windows.find((window) => window.startsAt.getTime() <= now.getTime() && now.getTime() < window.endsAt.getTime());
  if (current) {
    const message = stripHtml(current.message || '') || defaultMessage;
    return {
      enabled: true,
      message,
      source: 'window',
      windowId: current.id || undefined,
    };
  }

  const next = windows.find((window) => window.startsAt.getTime() > now.getTime());
  return {
    enabled: false,
    message: '',
    source: 'off',
    nextStartsAt: next?.startsAt.toISOString(),
    nextEndsAt: next?.endsAt.toISOString(),
  };
}

export function toAdminSettingsView(settings: IPlatformSettings, now = new Date()): PlatformSettingsAdminView {
  const email = settings.email || defaultEmailFromEnv();
  const defaults = settings.newChurchDefaults;
  const windows = listedWindows(settings).map((window) => ({
    id: window.id,
    startsAt: window.startsAt.toISOString(),
    endsAt: window.endsAt.toISOString(),
    message: window.message || '',
  }));
  return {
    registrations: {
      enabled: settings.registrations?.enabled !== false,
      requireEmailConfirmation: true,
      approvalMode: settings.registrations?.approvalMode === 'manual' ? 'manual' : 'automatic',
      closedMessage: settings.registrations?.closedMessage || '',
    },
    email: {
      senderName: email.senderName || 'Eclesiafy',
      senderAddress: email.senderAddress || defaultEmailFromEnv().senderAddress,
      replyTo: email.replyTo || '',
      resendStatus: resendStatus(),
      appOrigin: publicAppOrigin(),
      ttl: emailTtlValues(settings),
    },
    newChurchDefaults: {
      timezone: defaults?.timezone || 'America/Sao_Paulo',
      visitorFollowUpEnabled: followUpEnabled(settings),
      modules: {
        visitorFollowUpEnabled: followUpEnabled(settings),
      },
      retention: retentionValues(settings),
    },
    maintenance: {
      enabled: settings.maintenance?.enabled === true,
      message: settings.maintenance?.message || '',
      windows,
      effective: resolveEffectiveMaintenance(settings, now),
    },
    limits: {
      maxChurches: limitValue(settings.limits?.maxChurches),
      maxPendingApprovals: limitValue(settings.limits?.maxPendingApprovals),
    },
    legal: {
      termsUrl: settings.legal?.termsUrl || '',
      privacyUrl: settings.legal?.privacyUrl || '',
    },
    notice: {
      enabled: settings.notice?.enabled === true,
      message: settings.notice?.message || '',
      tone: settings.notice?.tone === 'warning' ? 'warning' : 'info',
    },
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export async function loadAdminPlatformSettings(): Promise<PlatformSettingsAdminView> {
  return toAdminSettingsView(await getOrCreatePlatformSettings());
}

export function toPublicPlatformStatus(
  settings: IPlatformSettings | null,
  now = new Date()
): PlatformPublicStatus {
  const registrationsEnabled = settings?.registrations?.enabled !== false;
  const closedMessage = stripHtml(settings?.registrations?.closedMessage || '');
  const effective = resolveEffectiveMaintenance(settings, now);
  const status: PlatformPublicStatus = {
    registrationsEnabled,
    maintenance: {
      enabled: effective.enabled,
      message: effective.enabled ? effective.message : '',
    },
  };
  if (!registrationsEnabled && closedMessage) {
    status.closedMessage = closedMessage;
  }
  const termsUrl = settings?.legal?.termsUrl || '';
  const privacyUrl = settings?.legal?.privacyUrl || '';
  if (termsUrl || privacyUrl) {
    status.legal = {
      ...(termsUrl ? { termsUrl } : {}),
      ...(privacyUrl ? { privacyUrl } : {}),
    };
  }
  const noticeMessage = stripHtml(settings?.notice?.message || '');
  if (settings?.notice?.enabled === true && noticeMessage) {
    status.notice = {
      enabled: true,
      message: noticeMessage,
      tone: settings.notice.tone === 'warning' ? 'warning' : 'info',
    };
  }
  return status;
}

export async function loadPublicPlatformStatus(): Promise<PlatformPublicStatus> {
  try {
    return toPublicPlatformStatus(await getOrCreatePlatformSettings());
  } catch {
    return { registrationsEnabled: true, maintenance: { enabled: false, message: '' } };
  }
}

export async function getEffectiveEmailDelivery(): Promise<EffectiveEmailDelivery> {
  const envFrom = getEmailFrom();
  const envReply = getEmailReplyTo();
  try {
    const settings = await getOrCreatePlatformSettings();
    const name = sanitizeHeaderValue(settings.email?.senderName || '');
    const address = sanitizeHeaderValue(settings.email?.senderAddress || '');
    if (name && address && isValidEmail(address) && isAllowedSenderAddress(address)) {
      const replyTo = sanitizeHeaderValue(settings.email?.replyTo || '');
      return {
        from: formatEmailFromHeader(name, address),
        replyTo: replyTo && isValidEmail(replyTo) ? replyTo : envReply,
      };
    }
  } catch {
    // Usa o fallback das variáveis de ambiente.
  }
  return { from: envFrom, replyTo: envReply };
}

export async function getEffectiveEmailTtl(): Promise<EffectiveEmailTtl> {
  const env = defaultEmailTtlFromEnv();
  try {
    const ttl = emailTtlValues(await getOrCreatePlatformSettings());
    return {
      verificationMs: ttl.verificationMinutes * 60_000,
      resetMs: ttl.resetMinutes * 60_000,
      resendMs: ttl.resendSeconds * 1000,
    };
  } catch {
    return {
      verificationMs: env.verificationMinutes * 60_000,
      resetMs: env.resetMinutes * 60_000,
      resendMs: env.resendSeconds * 1000,
    };
  }
}

export async function assertPlatformCanAcceptChurch(session?: ClientSession): Promise<void> {
  let settings: IPlatformSettings;
  try {
    settings = await getOrCreatePlatformSettings();
  } catch {
    return;
  }

  const maxChurches = limitValue(settings.limits?.maxChurches);
  const maxPending = limitValue(settings.limits?.maxPendingApprovals);
  const queryOptions = session ? { session } : undefined;

  if (maxChurches != null) {
    const total = await Church.countDocuments({}, queryOptions);
    if (total >= maxChurches) {
      throw new PlatformSettingsError(PLATFORM_AT_CAPACITY_ERROR, 403, PLATFORM_AT_CAPACITY_CODE);
    }
  }

  if (settings.registrations?.approvalMode === 'manual' && maxPending != null) {
    const pending = await Church.countDocuments({ approvalStatus: 'pending' }, queryOptions);
    if (pending >= maxPending) {
      throw new PlatformSettingsError(PLATFORM_AT_CAPACITY_ERROR, 403, PLATFORM_AT_CAPACITY_CODE);
    }
  }
}

function rejectUnknown(body: Record<string, unknown>, allowed: Set<string>, label: string) {
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new PlatformSettingsError(`${SETTINGS_UNKNOWN_ERROR} (${label})`);
  }
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PlatformSettingsError(`Informe ${label} válidos.`);
  }
  return value as Record<string, unknown>;
}

function validateEmailFields(input: { senderName: string; senderAddress: string; replyTo: string }) {
  const senderName = sanitizeHeaderValue(input.senderName);
  const senderAddress = sanitizeHeaderValue(input.senderAddress).toLowerCase();
  const replyTo = sanitizeHeaderValue(input.replyTo).toLowerCase();

  if (HEADER_BREAK.test(input.senderName) || HEADER_BREAK.test(input.senderAddress) || HEADER_BREAK.test(input.replyTo)) {
    throw new PlatformSettingsError('Os campos de e-mail não podem conter quebras de linha.');
  }
  if (senderName.length < 2 || senderName.length > PLATFORM_SENDER_NAME_MAX) {
    throw new PlatformSettingsError('O nome do remetente deve ter entre 2 e 80 caracteres.');
  }
  if (!isValidEmail(senderAddress) || senderAddress.length > PLATFORM_SENDER_ADDRESS_MAX) {
    throw new PlatformSettingsError('Informe um e-mail de remetente válido.');
  }
  if (!isAllowedSenderAddress(senderAddress)) {
    throw new PlatformSettingsError('O remetente deve pertencer a eclesiafy.com.br ou a um subdomínio.');
  }
  if (replyTo && (!isValidEmail(replyTo) || replyTo.length > PLATFORM_SENDER_ADDRESS_MAX)) {
    throw new PlatformSettingsError('Informe um e-mail de resposta válido ou deixe em branco.');
  }
  return { senderName, senderAddress, replyTo };
}

function parseBoundedInt(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new PlatformSettingsError(`Informe ${label} entre ${min} e ${max}.`);
  }
  return value;
}

function parseOptionalLimit(value: unknown, min: number, max: number, label: string): number | null {
  if (value == null || value === '') return null;
  return parseBoundedInt(value, min, max, label);
}

function parseEmailTtl(value: unknown): PlatformEmailTtl {
  if (value == null) return defaultEmailTtlFromEnv();
  const ttl = readObject(value, 'os prazos de e-mail');
  rejectUnknown(ttl, ALLOWED_EMAIL_TTL, 'prazos de e-mail');
  return {
    verificationMinutes: parseBoundedInt(
      ttl.verificationMinutes,
      PLATFORM_TTL_VERIFICATION_MIN,
      PLATFORM_TTL_VERIFICATION_MAX,
      'os minutos do código de confirmação'
    ),
    resetMinutes: parseBoundedInt(
      ttl.resetMinutes,
      PLATFORM_TTL_RESET_MIN,
      PLATFORM_TTL_RESET_MAX,
      'os minutos da redefinição de senha'
    ),
    resendSeconds: parseBoundedInt(
      ttl.resendSeconds,
      PLATFORM_TTL_RESEND_MIN,
      PLATFORM_TTL_RESEND_MAX,
      'os segundos entre reenvios'
    ),
  };
}

export function parseLegalUrl(value: unknown, label: string): string {
  if (value == null) return '';
  if (typeof value !== 'string') {
    throw new PlatformSettingsError(`Informe ${label} como uma URL.`);
  }
  const raw = value.trim();
  if (!raw) return '';
  if (raw.length > PLATFORM_LEGAL_URL_MAX) {
    throw new PlatformSettingsError(`${label} pode ter no máximo ${PLATFORM_LEGAL_URL_MAX} caracteres.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new PlatformSettingsError(`${label} deve ser uma URL absoluta válida.`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new PlatformSettingsError(`${label} não deve incluir credenciais, consulta ou fragmento.`);
  }
  const host = parsed.hostname.toLowerCase();
  if (isProductionRuntime()) {
    if (parsed.protocol !== 'https:') {
      throw new PlatformSettingsError(`${label} deve usar HTTPS.`);
    }
    if (isBlockedProductionHost(host)) {
      throw new PlatformSettingsError(`${label} não pode apontar para localhost nem para o domínio temporário da Vercel.`);
    }
  } else if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new PlatformSettingsError(`${label} deve usar HTTP ou HTTPS.`);
  }
  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
  return `${parsed.protocol}//${parsed.host}${path}`;
}

function parseLimits(value: unknown): { maxChurches: number | null; maxPendingApprovals: number | null } {
  if (value == null) return { maxChurches: null, maxPendingApprovals: null };
  const limits = readObject(value, 'os limites da plataforma');
  rejectUnknown(limits, ALLOWED_LIMITS, 'limites');
  const maxChurches = parseOptionalLimit(
    limits.maxChurches,
    PLATFORM_LIMIT_CHURCHES_MIN,
    PLATFORM_LIMIT_CHURCHES_MAX,
    'o máximo de igrejas'
  );
  const maxPendingApprovals = parseOptionalLimit(
    limits.maxPendingApprovals,
    PLATFORM_LIMIT_PENDING_MIN,
    PLATFORM_LIMIT_PENDING_MAX,
    'o máximo de aprovações pendentes'
  );
  return { maxChurches, maxPendingApprovals };
}

function parseLegal(value: unknown): { termsUrl: string; privacyUrl: string } {
  if (value == null) return { termsUrl: '', privacyUrl: '' };
  const legal = readObject(value, 'as páginas legais');
  rejectUnknown(legal, ALLOWED_LEGAL, 'páginas legais');
  return {
    termsUrl: parseLegalUrl(legal.termsUrl, 'O endereço dos termos'),
    privacyUrl: parseLegalUrl(legal.privacyUrl, 'O endereço da privacidade'),
  };
}

function parseChurchModules(
  value: unknown,
  fallback: boolean
): { visitorFollowUpEnabled: boolean } {
  if (value == null) return { visitorFollowUpEnabled: fallback };
  const modules = readObject(value, 'os módulos da nova igreja');
  rejectUnknown(modules, ALLOWED_MODULES, 'módulos');
  if (typeof modules.visitorFollowUpEnabled !== 'boolean') {
    throw new PlatformSettingsError('Informe se o acompanhamento nasce ligado ou desligado.');
  }
  return { visitorFollowUpEnabled: modules.visitorFollowUpEnabled };
}

function parseNotice(value: unknown): { enabled: boolean; message: string; tone: PlatformNoticeTone } {
  if (value == null) return { enabled: false, message: '', tone: 'info' };
  const notice = readObject(value, 'o aviso institucional');
  rejectUnknown(notice, ALLOWED_NOTICE, 'aviso institucional');
  if (typeof notice.enabled !== 'boolean') {
    throw new PlatformSettingsError('Informe se o aviso institucional está visível.');
  }
  if (notice.tone != null && notice.tone !== 'info' && notice.tone !== 'warning') {
    throw new PlatformSettingsError('O tom do aviso institucional deve ser informativo ou de atenção.');
  }
  const message = validatePlainMessage(
    typeof notice.message === 'string' ? notice.message : '',
    {
      required: notice.enabled,
      label: 'mensagem do aviso institucional',
    }
  );
  return {
    enabled: notice.enabled,
    message,
    tone: notice.tone === 'warning' ? 'warning' : 'info',
  };
}

function validatePlainMessage(message: string, options: {
  required?: boolean;
  minWhenPresent?: boolean;
  label: string;
}) {
  if (HTML_MARKUP.test(message)) {
    throw new PlatformSettingsError(`A ${options.label} deve ser texto simples, sem HTML.`);
  }
  const text = stripHtml(message);
  if (text.length > PLATFORM_MAINTENANCE_MESSAGE_MAX) {
    throw new PlatformSettingsError(`A ${options.label} pode ter no máximo ${PLATFORM_MAINTENANCE_MESSAGE_MAX} caracteres.`);
  }
  if (options.required && text.length < PLATFORM_MAINTENANCE_MESSAGE_MIN) {
    throw new PlatformSettingsError(
      `A ${options.label} deve ter entre ${PLATFORM_MAINTENANCE_MESSAGE_MIN} e ${PLATFORM_MAINTENANCE_MESSAGE_MAX} caracteres.`
    );
  }
  if (options.minWhenPresent && text.length > 0 && text.length < PLATFORM_CLOSED_MESSAGE_MIN) {
    throw new PlatformSettingsError(
      `A ${options.label} deve ter entre ${PLATFORM_CLOSED_MESSAGE_MIN} e ${PLATFORM_CLOSED_MESSAGE_MAX} caracteres, ou ficar em branco.`
    );
  }
  return text;
}

function validateMaintenance(enabled: boolean, message: string, hasWindows: boolean) {
  return validatePlainMessage(message, {
    required: enabled || hasWindows,
    label: 'mensagem de manutenção',
  });
}

function parseIsoDate(value: unknown, label: string): Date {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PlatformSettingsError(`Informe ${label} em ISO 8601.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new PlatformSettingsError(`Informe ${label} em ISO 8601.`);
  }
  return date;
}

type ParsedWindow = {
  id: Types.ObjectId;
  startsAt: Date;
  endsAt: Date;
  message: string;
};

function parseMaintenanceWindows(value: unknown): ParsedWindow[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new PlatformSettingsError('Informe a agenda de manutenção como uma lista.');
  }
  if (value.length > PLATFORM_MAINTENANCE_WINDOW_MAX) {
    throw new PlatformSettingsError(`A agenda pode ter no máximo ${PLATFORM_MAINTENANCE_WINDOW_MAX} janelas.`);
  }

  const windows = value.map((item, index) => {
    const window = readObject(item, `a janela ${index + 1}`);
    rejectUnknown(window, ALLOWED_WINDOW, `janela ${index + 1}`);
    const startsAt = parseIsoDate(window.startsAt, `o início da janela ${index + 1}`);
    const endsAt = parseIsoDate(window.endsAt, `o término da janela ${index + 1}`);
    if (startsAt.getTime() >= endsAt.getTime()) {
      throw new PlatformSettingsError(`A janela ${index + 1} precisa terminar depois de começar.`);
    }
    if (endsAt.getTime() - startsAt.getTime() > PLATFORM_MAINTENANCE_WINDOW_MAX_MS) {
      throw new PlatformSettingsError(`A janela ${index + 1} pode durar no máximo 72 horas.`);
    }
    const rawMessage = typeof window.message === 'string' ? window.message : '';
    const message = validatePlainMessage(rawMessage, {
      minWhenPresent: true,
      label: `mensagem da janela ${index + 1}`,
    });
    const rawId = typeof window.id === 'string' ? window.id.trim() : '';
    const id = Types.ObjectId.isValid(rawId) ? new Types.ObjectId(rawId) : new Types.ObjectId();
    return { id, startsAt, endsAt, message };
  });

  const ordered = [...windows].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1].endsAt.getTime() > ordered[index].startsAt.getTime()) {
      throw new PlatformSettingsError('As janelas de manutenção não podem se sobrepor.');
    }
  }
  return windows;
}

type SettingsPatch = {
  updatedAt: string;
  registrations: { enabled: boolean; approvalMode: PlatformApprovalMode; closedMessage: string };
  email: { senderName: string; senderAddress: string; replyTo: string; ttl: PlatformEmailTtl };
  newChurchDefaults: {
    timezone: string;
    visitorFollowUpEnabled: boolean;
    modules: { visitorFollowUpEnabled: boolean };
    retention: RetentionPolicyValues;
  };
  maintenance: { enabled: boolean; message: string; windows: ParsedWindow[] };
  limits: { maxChurches: number | null; maxPendingApprovals: number | null };
  legal: { termsUrl: string; privacyUrl: string };
  notice: { enabled: boolean; message: string; tone: PlatformNoticeTone };
};

function parseSettingsPatch(input: unknown): SettingsPatch {
  const body = readObject(input, 'as configurações');
  rejectUnknown(body, ALLOWED_ROOT, 'raiz');
  if (typeof body.updatedAt !== 'string' || !body.updatedAt.trim()) {
    throw new PlatformSettingsError('Atualize a página antes de salvar.');
  }
  if ('requireEmailConfirmation' in body) {
    throw new PlatformSettingsError('A confirmação de e-mail é obrigatória e não pode ser alterada.');
  }

  const registrations = readObject(body.registrations, 'o cadastro');
  rejectUnknown(registrations, ALLOWED_REGISTRATIONS, 'cadastro');
  if (registrations.requireEmailConfirmation === false) {
    throw new PlatformSettingsError('A confirmação de e-mail é obrigatória e não pode ser alterada.');
  }
  if (typeof registrations.enabled !== 'boolean') {
    throw new PlatformSettingsError('Informe se novos cadastros estão permitidos.');
  }
  if (registrations.approvalMode !== 'automatic' && registrations.approvalMode !== 'manual') {
    throw new PlatformSettingsError('Informe se a liberação das igrejas é automática ou manual.');
  }
  const closedMessage = validatePlainMessage(
    typeof registrations.closedMessage === 'string' ? registrations.closedMessage : '',
    {
      minWhenPresent: true,
      label: 'mensagem de cadastro fechado',
    }
  );

  const email = readObject(body.email, 'os dados de e-mail');
  rejectUnknown(email, ALLOWED_EMAIL, 'e-mail');
  const emailFields = validateEmailFields({
    senderName: typeof email.senderName === 'string' ? email.senderName : '',
    senderAddress: typeof email.senderAddress === 'string' ? email.senderAddress : '',
    replyTo: typeof email.replyTo === 'string' ? email.replyTo : '',
  });
  const ttl = parseEmailTtl(email.ttl);

  const defaults = readObject(body.newChurchDefaults, 'os padrões das igrejas');
  rejectUnknown(defaults, ALLOWED_DEFAULTS, 'padrões');
  const timezone = typeof defaults.timezone === 'string' ? defaults.timezone.trim() : '';
  if (!isSupportedTimezone(timezone)) {
    throw new PlatformSettingsError('Informe um fuso horário IANA suportado.');
  }
  if (typeof defaults.visitorFollowUpEnabled !== 'boolean') {
    throw new PlatformSettingsError('Informe se o acompanhamento nasce ligado ou desligado.');
  }
  const modules = parseChurchModules(defaults.modules, defaults.visitorFollowUpEnabled);
  const visitorFollowUpEnabled = modules.visitorFollowUpEnabled;
  const retentionBody = readObject(defaults.retention, 'os prazos de retenção');
  rejectUnknown(retentionBody, ALLOWED_RETENTION, 'retenção');
  const parsedRetention = parseRetentionPolicy(retentionBody);
  if (!parsedRetention.data) {
    throw new PlatformSettingsError(parsedRetention.error || 'Revise os prazos da política de retenção.');
  }

  const maintenance = readObject(body.maintenance, 'a manutenção');
  rejectUnknown(maintenance, ALLOWED_MAINTENANCE, 'manutenção');
  if (typeof maintenance.enabled !== 'boolean') {
    throw new PlatformSettingsError('Informe se o aviso de manutenção está visível.');
  }
  const windows = parseMaintenanceWindows(maintenance.windows);
  const message = validateMaintenance(
    maintenance.enabled,
    typeof maintenance.message === 'string' ? maintenance.message : '',
    windows.length > 0
  );
  const limits = parseLimits(body.limits);
  const legal = parseLegal(body.legal);
  const notice = parseNotice(body.notice);

  return {
    updatedAt: body.updatedAt.trim(),
    registrations: {
      enabled: registrations.enabled,
      approvalMode: registrations.approvalMode,
      closedMessage,
    },
    email: { ...emailFields, ttl },
    newChurchDefaults: {
      timezone,
      visitorFollowUpEnabled,
      modules,
      retention: parsedRetention.data,
    },
    maintenance: { enabled: maintenance.enabled, message, windows },
    limits,
    legal,
    notice,
  };
}

function flattenSettings(view: PlatformSettingsAdminView): Record<string, string | number | boolean> {
  return {
    'registrations.enabled': view.registrations.enabled,
    'registrations.approvalMode': view.registrations.approvalMode,
    'registrations.closedMessage.set': Boolean(view.registrations.closedMessage),
    'email.senderName': view.email.senderName,
    'email.ttl.verificationMinutes': view.email.ttl.verificationMinutes,
    'email.ttl.resetMinutes': view.email.ttl.resetMinutes,
    'email.ttl.resendSeconds': view.email.ttl.resendSeconds,
    'newChurchDefaults.timezone': view.newChurchDefaults.timezone,
    'newChurchDefaults.visitorFollowUpEnabled': view.newChurchDefaults.visitorFollowUpEnabled,
    'newChurchDefaults.modules.visitorFollowUpEnabled': view.newChurchDefaults.modules.visitorFollowUpEnabled,
    'newChurchDefaults.retention.enabled': view.newChurchDefaults.retention.enabled,
    'newChurchDefaults.retention.visitorsMonths': view.newChurchDefaults.retention.visitorsMonths,
    'newChurchDefaults.retention.prayersDays': view.newChurchDefaults.retention.prayersDays,
    'newChurchDefaults.retention.vehicleNoticesDays': view.newChurchDefaults.retention.vehicleNoticesDays,
    'newChurchDefaults.retention.guestAccessesDays': view.newChurchDefaults.retention.guestAccessesDays,
    'newChurchDefaults.retention.teamInvitationsDays': view.newChurchDefaults.retention.teamInvitationsDays,
    'newChurchDefaults.retention.portariaDevicesDays': view.newChurchDefaults.retention.portariaDevicesDays,
    'maintenance.enabled': view.maintenance.enabled,
    'maintenance.windows': view.maintenance.windows.length,
    'maintenance.effective.enabled': view.maintenance.effective.enabled,
    'limits.maxChurches': view.limits.maxChurches ?? 0,
    'limits.maxPendingApprovals': view.limits.maxPendingApprovals ?? 0,
    'legal.termsUrl.set': Boolean(view.legal.termsUrl),
    'legal.privacyUrl.set': Boolean(view.legal.privacyUrl),
    'notice.enabled': view.notice.enabled,
    'notice.tone': view.notice.tone,
    'notice.message.set': Boolean(view.notice.message),
  };
}

export function describeSettingsChanges(
  before: PlatformSettingsAdminView,
  after: PlatformSettingsAdminView
): Record<string, string | number | boolean> {
  const previous = flattenSettings(before);
  const next = flattenSettings(after);
  const changed: string[] = [];
  const metadata: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(next)) {
    if (previous[key] !== next[key]) {
      changed.push(key);
      metadata[`${key}.before`] = previous[key];
      metadata[`${key}.after`] = next[key];
    }
  }
  if (before.email.senderAddress !== after.email.senderAddress) changed.push('email.senderAddress');
  if (before.email.replyTo !== after.email.replyTo) changed.push('email.replyTo');
  metadata.changed = changed.join(',');
  return metadata;
}

export async function updatePlatformSettings(input: unknown): Promise<{
  settings: PlatformSettingsAdminView;
  changes: Record<string, string | number | boolean>;
}> {
  const patch = parseSettingsPatch(input);
  const current = await getOrCreatePlatformSettings();
  const currentStamp = current.updatedAt.getTime();
  const incomingStamp = new Date(patch.updatedAt).getTime();
  if (!Number.isFinite(incomingStamp) || incomingStamp !== currentStamp) {
    throw new PlatformSettingsError(SETTINGS_CONFLICT_ERROR, 409, 'settings_conflict');
  }

  const before = toAdminSettingsView(current);
  current.registrations = {
    enabled: patch.registrations.enabled,
    approvalMode: patch.registrations.approvalMode,
    closedMessage: patch.registrations.closedMessage,
  };
  current.email = {
    senderName: patch.email.senderName,
    senderAddress: patch.email.senderAddress,
    replyTo: patch.email.replyTo,
    ttl: patch.email.ttl,
  };
  current.newChurchDefaults = {
    timezone: patch.newChurchDefaults.timezone,
    visitorFollowUpEnabled: patch.newChurchDefaults.visitorFollowUpEnabled,
    modules: {
      visitorFollowUpEnabled: patch.newChurchDefaults.modules.visitorFollowUpEnabled,
    },
    retention: patch.newChurchDefaults.retention,
  };
  current.maintenance = {
    enabled: patch.maintenance.enabled,
    message: patch.maintenance.message,
    windows: patch.maintenance.windows.map((window) => ({
      _id: window.id,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      message: window.message,
    })),
  } as IPlatformSettings['maintenance'];
  current.limits = {
    maxChurches: patch.limits.maxChurches,
    maxPendingApprovals: patch.limits.maxPendingApprovals,
  };
  current.legal = {
    termsUrl: patch.legal.termsUrl,
    privacyUrl: patch.legal.privacyUrl,
  };
  current.notice = {
    enabled: patch.notice.enabled,
    message: patch.notice.message,
    tone: patch.notice.tone,
  };
  await current.save();
  const settings = toAdminSettingsView(current);
  return { settings, changes: describeSettingsChanges(before, settings) };
}

export const TEST_EMAIL_RATE_LIMIT_MS = 60_000;

export function parseSettingsTestEmailBody(input: unknown): void {
  if (input == null) return;
  const body = readObject(input, 'o e-mail de teste');
  if ('churchId' in body) {
    throw new PlatformSettingsError('O identificador da igreja não deve ser enviado no corpo.');
  }
  if ('to' in body) {
    throw new PlatformSettingsError('O destinatário do e-mail de teste não pode ser informado.');
  }
  rejectUnknown(body, new Set(), 'e-mail de teste');
}
