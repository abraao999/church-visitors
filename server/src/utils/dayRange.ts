/** Fuso da igreja. Cultos noturnos no Brasil não podem virar o dia no UTC da Vercel. */
export const CHURCH_TIMEZONE = 'America/Sao_Paulo';

interface CivilTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function civilInZone(date: Date, timeZone = CHURCH_TIMEZONE): CivilTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

/**
 * Converte data e hora civis no fuso da igreja para um instante UTC.
 * Ajusta o deslocamento duas vezes para atravessar a virada de horário de verão.
 */
export function civilToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
  timeZone = CHURCH_TIMEZONE
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);

  const shift = (instant: number): number => {
    const seen = civilInZone(new Date(instant), timeZone);
    const asUtc = Date.UTC(
      seen.year,
      seen.month - 1,
      seen.day,
      seen.hour,
      seen.minute,
      seen.second,
      millisecond
    );
    return instant - (asUtc - utcGuess);
  };

  return new Date(shift(shift(utcGuess)));
}

export function startOfDay(date: Date, timeZone = CHURCH_TIMEZONE): Date {
  const { year, month, day } = civilInZone(date, timeZone);
  return civilToUtc(year, month, day, 0, 0, 0, 0, timeZone);
}

export function endOfDay(date: Date, timeZone = CHURCH_TIMEZONE): Date {
  const { year, month, day } = civilInZone(date, timeZone);
  return civilToUtc(year, month, day, 23, 59, 59, 999, timeZone);
}

/** Interpreta YYYY-MM-DD como o dia civil em America/Sao_Paulo, não no fuso do servidor. */
export function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = civilToUtc(year, month, day, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}
