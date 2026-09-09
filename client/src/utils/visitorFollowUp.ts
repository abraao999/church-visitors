import type { FollowUpPreset, FollowUpStatus } from '../types';

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  awaiting: 'Aguardando contato',
  contacted: 'Contato realizado',
  integrating: 'Em integração',
  closed: 'Encerrado',
};

export const FOLLOW_UP_PRESET_LABELS: Record<FollowUpPreset, string> = {
  today: 'Hoje',
  tomorrow: 'Amanhã',
  in_3_days: 'Em 3 dias',
  in_7_days: 'Em 7 dias',
  custom: 'Escolher uma data',
};

export const FOLLOW_UP_CONTACT_TYPE_LABELS = {
  call: 'Ligação',
  whatsapp: 'WhatsApp',
  visit: 'Visita',
  other: 'Outro',
} as const;

export function shouldShowFollowUpBlock(enabled: boolean, canCreate: boolean): boolean {
  return enabled === true && canCreate === true;
}

export function maskPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function visitDateLabel(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
}

export function nextContactLabel(value?: string, isToday?: boolean): string {
  if (isToday) return 'Hoje';
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function localDateTimeValue(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
