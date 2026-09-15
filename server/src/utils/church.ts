import { randomBytes } from 'crypto';

export const CHURCH_APPROVAL_STATUSES = ['pending', 'approved'] as const;
export type ChurchApprovalStatus = (typeof CHURCH_APPROVAL_STATUSES)[number];

export function normalizeChurchName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
}

/** Igreja liberada para sessão, QR, TV e portaria. Sem campo = aprovada (legado). */
export function isChurchAvailable(church: {
  active?: boolean | null;
  approvalStatus?: string | null;
}): boolean {
  return church.active !== false && church.approvalStatus !== 'pending';
}

export function availableChurchFilter(id: unknown) {
  return {
    _id: id,
    active: true,
    approvalStatus: { $ne: 'pending' as const },
  };
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
