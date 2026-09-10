import {
  CHURCH_TIMEZONE,
  civilInZone,
  civilToUtc,
  endOfDay,
  parseDateOnly,
  startOfDay,
} from './dayRange.js';
import { addCivilDays, weekdayInZone } from './serviceSchedule.js';

export const REPORT_PRESETS = [
  'this_week',
  'this_month',
  'last_3_months',
  'last_6_months',
  'this_year',
  'custom',
] as const;

export type ReportPreset = (typeof REPORT_PRESETS)[number];

export const MAX_REPORT_DAYS = 732;

export type ReportRange = {
  from: Date;
  to: Date;
  fromKey: string;
  toKey: string;
  preset: ReportPreset;
};

export function dateKeyInZone(date: Date, timeZone = CHURCH_TIMEZONE): string {
  const { year, month, day } = civilInZone(date, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function startOfWeekSunday(date: Date, timeZone = CHURCH_TIMEZONE): Date {
  return startOfDay(addCivilDays(date, -weekdayInZone(date, timeZone), timeZone), timeZone);
}

export function startOfMonth(date: Date, timeZone = CHURCH_TIMEZONE): Date {
  const { year, month } = civilInZone(date, timeZone);
  return civilToUtc(year, month, 1, 0, 0, 0, 0, timeZone);
}

export function addCivilMonths(date: Date, months: number, timeZone = CHURCH_TIMEZONE): Date {
  const { year, month } = civilInZone(date, timeZone);
  const absolute = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(absolute / 12);
  const nextMonth = ((absolute % 12) + 12) % 12 + 1;
  return civilToUtc(nextYear, nextMonth, 1, 0, 0, 0, 0, timeZone);
}

export function startOfYear(date: Date, timeZone = CHURCH_TIMEZONE): Date {
  const { year } = civilInZone(date, timeZone);
  return civilToUtc(year, 1, 1, 0, 0, 0, 0, timeZone);
}

export function resolveReportRange(input: {
  preset?: unknown;
  from?: unknown;
  to?: unknown;
  now?: Date;
  timeZone?: string;
}): { range?: ReportRange; error?: string } {
  const timeZone = input.timeZone || CHURCH_TIMEZONE;
  const now = input.now || new Date();
  const preset = REPORT_PRESETS.includes(input.preset as ReportPreset)
    ? (input.preset as ReportPreset)
    : 'this_month';

  let from: Date;
  let to: Date;

  if (preset === 'custom') {
    if (typeof input.from !== 'string' || typeof input.to !== 'string') {
      return { error: 'Informe a data inicial e a data final.' };
    }
    const start = parseDateOnly(input.from);
    const end = parseDateOnly(input.to);
    if (!start || !end) {
      return { error: 'Informe um período válido.' };
    }
    from = startOfDay(start, timeZone);
    to = endOfDay(end, timeZone);
  } else if (preset === 'this_week') {
    from = startOfWeekSunday(now, timeZone);
    to = endOfDay(now, timeZone);
  } else if (preset === 'this_month') {
    from = startOfMonth(now, timeZone);
    to = endOfDay(now, timeZone);
  } else if (preset === 'last_3_months') {
    from = addCivilMonths(now, -3, timeZone);
    to = endOfDay(now, timeZone);
  } else if (preset === 'last_6_months') {
    from = addCivilMonths(now, -6, timeZone);
    to = endOfDay(now, timeZone);
  } else {
    from = startOfYear(now, timeZone);
    to = endOfDay(now, timeZone);
  }

  if (from.getTime() > to.getTime()) {
    return { error: 'A data inicial precisa ser anterior à data final.' };
  }

  const days = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
  if (days > MAX_REPORT_DAYS) {
    return { error: 'O período máximo é de 24 meses.' };
  }

  return {
    range: {
      from,
      to,
      fromKey: dateKeyInZone(from, timeZone),
      toKey: dateKeyInZone(to, timeZone),
      preset,
    },
  };
}

export function previousEquivalentRange(range: ReportRange, timeZone = CHURCH_TIMEZONE): ReportRange {
  const duration = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  const from = new Date(to.getTime() - duration);
  return {
    from,
    to,
    fromKey: dateKeyInZone(from, timeZone),
    toKey: dateKeyInZone(to, timeZone),
    preset: 'custom',
  };
}

export function compareCounts(current: number, previous: number): {
  current: number;
  previous: number;
  delta: number;
  percent: number | null;
} {
  return {
    current,
    previous,
    delta: current - previous,
    percent: previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10,
  };
}

export function formatCompareLabel(compare: { percent: number | null; delta: number }): string {
  if (compare.percent == null) return 'Sem comparação disponível';
  const sign = compare.percent > 0 ? '+' : '';
  return `${sign}${compare.percent}%`;
}

export function parseVisitKind(value: unknown): 'first' | 'returning' | 'unknown' {
  if (value === 'first' || value === 'returning') return value;
  return 'unknown';
}

export function eventTime(record: { capturedAt?: Date; createdAt?: Date }): Date {
  return record.capturedAt || record.createdAt || new Date();
}
