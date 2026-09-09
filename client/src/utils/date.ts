export function todayLocalISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatTodayLabel(): string {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function formatPanelWeekday(date = new Date(), timeZone?: string): string {
  return date
    .toLocaleDateString('pt-BR', { weekday: 'long', ...(timeZone ? { timeZone } : {}) })
    .toUpperCase();
}

export function formatPanelDayMonth(date = new Date(), timeZone?: string): string {
  return date
    .toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      ...(timeZone ? { timeZone } : {}),
    })
    .toUpperCase();
}

export function formatClockTime(date = new Date()): string {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
