const DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatAdminDate(value?: string | null): string {
  if (!value) return 'Ainda não acessou';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Ainda não acessou';
  return DATE.format(date);
}

export function formatAdminDateTime(value?: string | null): string {
  if (!value) return 'Ainda não acessou';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Ainda não acessou';
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) {
    return `Hoje, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return DATE_TIME.format(date);
}

export function canManageChurches(role?: string): boolean {
  return role === 'platform_owner';
}

export function canSupportChurches(role?: string): boolean {
  return role === 'platform_owner' || role === 'support';
}
