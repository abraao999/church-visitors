import { civilInZone, civilToUtc, parseDateOnly } from './dayRange.js';

export const FOLLOW_UP_STATUSES = ['awaiting', 'contacted', 'integrating', 'closed'] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  awaiting: 'Aguardando contato',
  contacted: 'Contato realizado',
  integrating: 'Em integração',
  closed: 'Encerrado',
};

export const FOLLOW_UP_CONTACT_TYPES = ['call', 'whatsapp', 'visit', 'other'] as const;
export type FollowUpContactType = (typeof FOLLOW_UP_CONTACT_TYPES)[number];

export const FOLLOW_UP_CONTACT_TYPE_LABELS: Record<FollowUpContactType, string> = {
  call: 'Ligação',
  whatsapp: 'WhatsApp',
  visit: 'Visita',
  other: 'Outro',
};

export const FOLLOW_UP_PRESETS = ['today', 'tomorrow', 'in_3_days', 'in_7_days', 'custom'] as const;
export type FollowUpPreset = (typeof FOLLOW_UP_PRESETS)[number];

export const FOLLOW_UP_DISABLED_ERROR =
  'O acompanhamento de visitantes não está ativado para esta igreja.';
export const FOLLOW_UP_FORBIDDEN_ERROR = 'Você não tem permissão para o acompanhamento.';
export const FOLLOW_UP_PHONE_REQUIRED_ERROR = 'Informe o telefone ou WhatsApp para o contato.';

const STATUS_SET = new Set<string>(FOLLOW_UP_STATUSES);
const TYPE_SET = new Set<string>(FOLLOW_UP_CONTACT_TYPES);
const PRESET_SET = new Set<string>(FOLLOW_UP_PRESETS);

export function isFollowUpStatus(value: unknown): value is FollowUpStatus {
  return typeof value === 'string' && STATUS_SET.has(value);
}

export function isFollowUpContactType(value: unknown): value is FollowUpContactType {
  return typeof value === 'string' && TYPE_SET.has(value);
}

export function isFollowUpPreset(value: unknown): value is FollowUpPreset {
  return typeof value === 'string' && PRESET_SET.has(value);
}

export function normalizeFollowUpPhone(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\D/g, '').slice(0, 13);
}

export function isValidFollowUpPhone(digits: string): boolean {
  return digits.length >= 10 && digits.length <= 13;
}

export function formatFollowUpPhone(digits: string): string {
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

export function addCalendarDays(date: Date, days: number, timeZone: string): Date {
  const { year, month, day } = civilInZone(date, timeZone);
  return civilToUtc(year, month, day + days, 12, 0, 0, 0, timeZone);
}

export function dateKeyInZone(date: Date, timeZone: string): string {
  const { year, month, day } = civilInZone(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function resolveNextContactAt(
  preset: unknown,
  customDate: unknown,
  now: Date,
  timeZone: string
): { date?: Date; error?: string } {
  if (!isFollowUpPreset(preset)) {
    return { date: addCalendarDays(now, 1, timeZone) };
  }
  if (preset === 'today') return { date: addCalendarDays(now, 0, timeZone) };
  if (preset === 'tomorrow') return { date: addCalendarDays(now, 1, timeZone) };
  if (preset === 'in_3_days') return { date: addCalendarDays(now, 3, timeZone) };
  if (preset === 'in_7_days') return { date: addCalendarDays(now, 7, timeZone) };
  if (typeof customDate !== 'string') {
    return { error: 'Escolha a data do primeiro contato.' };
  }
  const parsed = parseDateOnly(customDate);
  if (!parsed) {
    return { error: 'Informe uma data válida para o próximo contato.' };
  }
  return { date: parsed };
}

export function escapeSearch(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sanitizeSearch(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 80);
}

export function parseFollowUpNote(value: unknown, maxLength = 500): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}
