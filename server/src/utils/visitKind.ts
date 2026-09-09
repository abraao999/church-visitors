export type VisitKind = 'first' | 'returning' | 'unknown';

export const FAMILY_VISIT_KIND_ERROR =
  'A resposta sobre primeira visita deve ser a mesma para toda a família ou grupo.';

export function hasMixedFamilyVisitKinds(
  visitors: ReadonlyArray<{ visitKind: VisitKind }>
): boolean {
  return new Set(visitors.map((visitor) => visitor.visitKind)).size > 1;
}
