const PLACEHOLDER_PREFIX = 'troque-por-';

export function isPlaceholderSecret(value: string | undefined): boolean {
  if (!value) return false;
  return value.trim().toLowerCase().startsWith(PLACEHOLDER_PREFIX);
}

export function requireConfiguredSecret(
  name: 'JWT_SECRET' | 'GUEST_ACCESS_SECRET' | 'CRON_SECRET',
  value: string | undefined,
  minLength = 32
): string {
  if (!value || value.length < minLength) {
    throw new Error(`${name} deve possuir pelo menos ${minLength} caracteres`);
  }
  if (isPlaceholderSecret(value)) {
    throw new Error(
      `${name} ainda está com o valor de exemplo. Gere uma chave com openssl rand -hex 32.`
    );
  }
  return value;
}
