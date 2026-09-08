/**
 * Índice único de idempotência. Sparse + unique no Mongo ainda indexa `null`,
 * então o segundo cadastro interno da mesma igreja (sem requestId) quebrava.
 * O filtro parcial só considera requestId string de verdade.
 */
export const REQUEST_ID_INDEX_NAME = 'churchId_1_requestId_1';

export const REQUEST_ID_UNIQUE_INDEX = {
  unique: true,
  name: REQUEST_ID_INDEX_NAME,
  partialFilterExpression: { requestId: { $type: 'string' } },
} as const;

export function requestIdIndexNeedsReplacement(index: {
  unique?: boolean;
  sparse?: boolean;
  partialFilterExpression?: unknown;
} | undefined): boolean {
  if (!index) return false;
  const partial = index.partialFilterExpression as
    | { requestId?: { $type?: string } }
    | undefined;
  return !(index.unique === true && partial?.requestId?.$type === 'string');
}
