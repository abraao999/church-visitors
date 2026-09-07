/** Evita que o último salvamento apague o trabalho de outra pessoa na mesma tela. */

export const STALE_WRITE_ERROR =
  'Este registro foi alterado em outro lugar. Recarregue e tente de novo.';

export const MISSING_UPDATED_AT_ERROR = 'Recarregue a lista e tente de novo.';

export function parseExpectedUpdatedAt(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function sameInstant(stored: Date | undefined, expected: Date): boolean {
  if (!stored) return false;
  return stored.getTime() === expected.getTime();
}
