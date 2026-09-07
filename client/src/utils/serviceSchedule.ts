import type { RecurrenceFrequency, ServiceStatus } from '../types';

export const DURATION_OPTIONS = [
  { value: 60, label: '1 hora' },
  { value: 90, label: '1 hora e 30 minutos' },
  { value: 120, label: '2 horas' },
  { value: 150, label: '2 horas e 30 minutos' },
  { value: 180, label: '3 horas' },
] as const;

export const WEEKDAY_LABELS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

export function serviceDateKey(dateStr?: string): string {
  return dateStr?.split('T')[0] ?? '';
}

export function weekdayFromIso(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return 0;
  return new Date(y, m - 1, d).getDay();
}

export function shiftToWeekday(dateStr: string, weekday: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const current = new Date(y, m - 1, d);
  while (current.getDay() !== weekday) {
    current.setDate(current.getDate() + 1);
  }
  return toIso(current);
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDaysIso(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const current = new Date(y, m - 1, d);
  current.setDate(current.getDate() + days);
  return toIso(current);
}

export function addMinutesClock(time: string, minutes: number): string {
  const [h, min] = time.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(min)) return time;
  const total = (((h * 60 + min + minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function countOccurrences(
  startDate: string,
  endDate: string,
  frequency: RecurrenceFrequency
): number {
  const step = frequency === 'biweekly' ? 14 : 7;
  let count = 0;
  let current = startDate;
  while (current <= endDate && count < 100) {
    count += 1;
    current = addDaysIso(current, step);
  }
  return count;
}

export function longDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function statusClass(status?: ServiceStatus): string {
  return status ? `service-status-${status}` : '';
}

export function countdownLabel(targetIso?: string, nowIso?: string): string | null {
  if (!targetIso) return null;
  const target = new Date(targetIso).getTime();
  const now = nowIso ? new Date(nowIso).getTime() : Date.now();
  const diff = target - now;
  if (diff <= 0) return null;
  const minutes = Math.max(1, Math.round(diff / 60_000));
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest} min` : `${hours}h`;
  }
  return `${minutes} min`;
}

export function yearEndIso(dateStr: string): string {
  const year = dateStr.slice(0, 4);
  return `${year}-12-31`;
}

export function requestId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
