import { Types } from 'mongoose';

export type TenantFilter = Record<string, unknown> & { churchId: Types.ObjectId };

/**
 * Acrescenta o escopo da igreja por último, impedindo que um filtro recebido do
 * cliente substitua o tenant validado na sessão.
 */
export function withChurch(
  churchId: string,
  filter: Record<string, unknown> = {}
): TenantFilter {
  if (!Types.ObjectId.isValid(churchId)) {
    throw new Error('Contexto da igreja inválido');
  }

  return {
    ...filter,
    churchId: new Types.ObjectId(churchId),
  };
}

export function tenantRecordFilter(
  churchId: string,
  recordId: unknown
): TenantFilter | null {
  if (typeof recordId !== 'string') return null;
  if (!Types.ObjectId.isValid(recordId)) return null;
  return withChurch(churchId, { _id: new Types.ObjectId(recordId) });
}
