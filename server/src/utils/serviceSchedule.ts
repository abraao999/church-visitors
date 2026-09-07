import { Types } from 'mongoose';
import {
  CHURCH_TIMEZONE,
  civilInZone,
  civilToUtc,
  endOfDay,
  parseDateOnly,
  startOfDay,
} from './dayRange.js';

export const DEFAULT_DURATION_MINUTES = 120;
export const DEFAULT_LEAD_MINUTES = 30;
export const MAX_OCCURRENCES = 100;
export const MAX_SERIES_MONTHS = 18;
export const DURATION_OPTIONS = [60, 90, 120, 150, 180] as const;

export const SERVICE_STATUSES = [
  'scheduled',
  'reception_open',
  'in_progress',
  'closed',
  'cancelled',
] as const;

export type ServiceStatus = (typeof SERVICE_STATUSES)[number];
export type RecurrenceFrequency = 'weekly' | 'biweekly';

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  scheduled: 'Agendado',
  reception_open: 'Recepção aberta',
  in_progress: 'Culto em andamento',
  closed: 'Encerrado',
  cancelled: 'Cancelado',
};

export interface ServiceScheduleInput {
  date: Date;
  time?: string;
  scheduledStartAt?: Date | null;
  durationMinutes?: number | null;
  activationLeadMinutes?: number | null;
  cancelledAt?: Date | null;
  closedAt?: Date | null;
  extendedUntil?: Date | null;
  openedAt?: Date | null;
}

export interface ServiceWindow {
  scheduledStartAt: Date | null;
  receptionStartsAt: Date | null;
  endsAt: Date | null;
  plannedEndsAt: Date | null;
  status: ServiceStatus;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function churchTimezone(value?: string | null): string {
  return value && value.trim() ? value.trim() : CHURCH_TIMEZONE;
}

export function parseClock(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const time = value.trim();
  return TIME_PATTERN.test(time) ? time : null;
}

export function combineDateAndTime(
  date: Date,
  time: string,
  timeZone = CHURCH_TIMEZONE
): Date | null {
  const clock = parseClock(time);
  if (!clock) return null;
  const civil = civilInZone(date, timeZone);
  const [hour, minute] = clock.split(':').map(Number);
  return civilToUtc(civil.year, civil.month, civil.day, hour, minute, 0, 0, timeZone);
}

export function addCivilDays(date: Date, days: number, timeZone = CHURCH_TIMEZONE): Date {
  const civil = civilInZone(date, timeZone);
  return civilToUtc(civil.year, civil.month, civil.day + days, 12, 0, 0, 0, timeZone);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function weekdayInZone(date: Date, timeZone = CHURCH_TIMEZONE): number {
  const label = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return weekdays[label] ?? 0;
}

export function formatClock(date: Date, timeZone = CHURCH_TIMEZONE): string {
  const { hour, minute } = civilInZone(date, timeZone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatCivilDate(date: Date, timeZone = CHURCH_TIMEZONE): string {
  const { year, month, day } = civilInZone(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function scheduledStartOf(
  service: ServiceScheduleInput,
  timeZone = CHURCH_TIMEZONE
): Date | null {
  if (service.scheduledStartAt) return new Date(service.scheduledStartAt);
  if (service.time) return combineDateAndTime(service.date, service.time, timeZone);
  return null;
}

export function resolveServiceWindow(
  service: ServiceScheduleInput,
  now = new Date(),
  timeZone = CHURCH_TIMEZONE
): ServiceWindow {
  if (service.cancelledAt) {
    return {
      scheduledStartAt: scheduledStartOf(service, timeZone),
      receptionStartsAt: null,
      endsAt: null,
      plannedEndsAt: null,
      status: 'cancelled',
    };
  }

  const start = scheduledStartOf(service, timeZone);
  const duration = service.durationMinutes || DEFAULT_DURATION_MINUTES;
  const lead = service.activationLeadMinutes || DEFAULT_LEAD_MINUTES;

  if (!start) {
    const dayEnded = now.getTime() > endOfDay(service.date, timeZone).getTime();
    return {
      scheduledStartAt: null,
      receptionStartsAt: null,
      endsAt: null,
      plannedEndsAt: null,
      status: service.closedAt || dayEnded ? 'closed' : 'scheduled',
    };
  }

  const plannedEnd = addMinutes(start, duration);
  const extended =
    service.extendedUntil && service.extendedUntil.getTime() > plannedEnd.getTime()
      ? service.extendedUntil
      : plannedEnd;
  const reception = service.openedAt
    ? new Date(Math.min(service.openedAt.getTime(), addMinutes(start, -lead).getTime()))
    : addMinutes(start, -lead);

  if (service.closedAt) {
    return {
      scheduledStartAt: start,
      receptionStartsAt: reception,
      endsAt: service.closedAt,
      plannedEndsAt: plannedEnd,
      status: 'closed',
    };
  }

  if (now.getTime() >= extended.getTime()) {
    return {
      scheduledStartAt: start,
      receptionStartsAt: reception,
      endsAt: extended,
      plannedEndsAt: plannedEnd,
      status: 'closed',
    };
  }

  if (now.getTime() >= start.getTime()) {
    return {
      scheduledStartAt: start,
      receptionStartsAt: reception,
      endsAt: extended,
      plannedEndsAt: plannedEnd,
      status: 'in_progress',
    };
  }

  if (now.getTime() >= reception.getTime()) {
    return {
      scheduledStartAt: start,
      receptionStartsAt: reception,
      endsAt: extended,
      plannedEndsAt: plannedEnd,
      status: 'reception_open',
    };
  }

  return {
    scheduledStartAt: start,
    receptionStartsAt: reception,
    endsAt: extended,
    plannedEndsAt: plannedEnd,
    status: 'scheduled',
  };
}

export function resolveServiceStatus(
  service: ServiceScheduleInput,
  now = new Date(),
  timeZone = CHURCH_TIMEZONE
): ServiceStatus {
  return resolveServiceWindow(service, now, timeZone).status;
}

export function isOperationalStatus(status: ServiceStatus): boolean {
  return status === 'reception_open' || status === 'in_progress';
}

export function windowsOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date }
): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

export function operationalWindow(
  service: ServiceScheduleInput,
  timeZone = CHURCH_TIMEZONE
): { start: Date; end: Date } | null {
  if (service.cancelledAt || service.closedAt) return null;
  const window = resolveServiceWindow(service, service.scheduledStartAt || service.date, timeZone);
  if (!window.receptionStartsAt || !window.endsAt) return null;
  return { start: window.receptionStartsAt, end: window.endsAt };
}

export function buildOccurrenceDates(input: {
  startDate: Date;
  endDate: Date;
  frequency: RecurrenceFrequency;
  timeZone?: string;
}): Date[] {
  const timeZone = input.timeZone || CHURCH_TIMEZONE;
  const step = input.frequency === 'biweekly' ? 14 : 7;
  const limit = addCivilDays(input.startDate, MAX_SERIES_MONTHS * 31, timeZone);
  const last = input.endDate.getTime() < limit.getTime() ? input.endDate : limit;
  const dates: Date[] = [];
  let current = input.startDate;

  while (current.getTime() <= last.getTime() && dates.length < MAX_OCCURRENCES) {
    dates.push(current);
    current = addCivilDays(current, step, timeZone);
  }

  return dates;
}

export function previewLimitsError(
  startDate: Date,
  endDate: Date,
  frequency: RecurrenceFrequency,
  timeZone = CHURCH_TIMEZONE
): string | null {
  if (endDate.getTime() < startDate.getTime()) {
    return 'A data final precisa ser igual ou posterior à primeira ocorrência.';
  }
  const maxEnd = addCivilDays(startDate, MAX_SERIES_MONTHS * 31, timeZone);
  const dates = buildOccurrenceDates({ startDate, endDate, frequency, timeZone });
  if (endDate.getTime() > maxEnd.getTime()) {
    return `A repetição pode ir no máximo até ${MAX_SERIES_MONTHS} meses. Ajuste a data final.`;
  }
  if (dates.length >= MAX_OCCURRENCES && addCivilDays(dates[dates.length - 1], frequency === 'biweekly' ? 14 : 7, timeZone).getTime() <= endDate.getTime()) {
    return `Uma série pode ter no máximo ${MAX_OCCURRENCES} cultos. Encurte a data final.`;
  }
  return null;
}

export function sameChurchId(churchId: string, serviceChurchId: unknown): boolean {
  return String(serviceChurchId) === churchId && Types.ObjectId.isValid(churchId);
}

export function parseDurationMinutes(value: unknown): number | null {
  const minutes = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 12 * 60) return null;
  return minutes;
}

export function parseFrequency(value: unknown): RecurrenceFrequency | null {
  return value === 'weekly' || value === 'biweekly' ? value : null;
}

export function parseDateInput(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return null;
  return parseDateOnly(value.split('T')[0] ?? '');
}

export function parseRequestId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const requestId = value.trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) return undefined;
  return requestId;
}

export function alignToWeekday(
  date: Date,
  weekday: number,
  timeZone = CHURCH_TIMEZONE
): Date {
  let current = date;
  for (let i = 0; i < 7; i += 1) {
    if (weekdayInZone(current, timeZone) === weekday) return current;
    current = addCivilDays(current, 1, timeZone);
  }
  return date;
}

export function formatLongDate(date: Date, timeZone = CHURCH_TIMEZONE): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

export function frequencyLabel(frequency: RecurrenceFrequency): string {
  return frequency === 'biweekly' ? 'A cada duas semanas' : 'Toda semana';
}

export function weekdayLabel(weekday: number): string {
  return [
    'domingo',
    'segunda-feira',
    'terça-feira',
    'quarta-feira',
    'quinta-feira',
    'sexta-feira',
    'sábado',
  ][weekday] ?? '';
}

export function conflictMessage(title: string): string {
  return `O ${title} já estará ativo nesse horário. Ajuste o horário ou a duração.`;
}

export function durationLabel(minutes: number): string {
  if (minutes === 60) return '1 hora';
  if (minutes === 90) return '1 hora e 30 minutos';
  if (minutes === 120) return '2 horas';
  if (minutes === 150) return '2 horas e 30 minutos';
  if (minutes === 180) return '3 horas';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}h ${rest} min`;
  if (hours) return `${hours}h`;
  return `${minutes} min`;
}

export function buildServicePreview(input: {
  startDate: Date;
  time: string;
  durationMinutes: number;
  activationLeadMinutes?: number;
  recurring: boolean;
  frequency?: RecurrenceFrequency;
  endDate?: Date;
  timeZone?: string;
}) {
  const timeZone = input.timeZone || CHURCH_TIMEZONE;
  const lead = input.activationLeadMinutes ?? DEFAULT_LEAD_MINUTES;
  const start = combineDateAndTime(input.startDate, input.time, timeZone);
  if (!start) return { error: 'Informe um horário válido.' as const };

  const reception = addMinutes(start, -lead);
  const endsAt = addMinutes(start, input.durationMinutes);
  const dates = input.recurring && input.frequency && input.endDate
    ? buildOccurrenceDates({
        startDate: input.startDate,
        endDate: input.endDate,
        frequency: input.frequency,
        timeZone,
      })
    : [input.startDate];
  const limitError =
    input.recurring && input.frequency && input.endDate
      ? previewLimitsError(input.startDate, input.endDate, input.frequency, timeZone)
      : null;

  return {
    firstOccurrenceLabel: formatLongDate(start, timeZone),
    receptionTime: formatClock(reception, timeZone),
    startTime: formatClock(start, timeZone),
    endTime: formatClock(endsAt, timeZone),
    repeatLabel:
      input.recurring && input.frequency
        ? `${frequencyLabel(input.frequency).toLowerCase()}, ${weekdayLabel(weekdayInZone(input.startDate, timeZone))}`
        : 'Culto único',
    count: dates.length,
    dates,
    error: limitError,
  };
}

export { startOfDay, endOfDay };
