import { randomBytes } from 'crypto';

export function normalizeChurchName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
}

export function createChurchSlug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'igreja';

  // O sufixo evita slugs previsivelmente iguais; o slug nunca é usado para autorizar acesso.
  return `${base}-${randomBytes(4).toString('hex')}`;
}
