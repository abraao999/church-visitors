export const FAMILY_CITY_ERROR = 'A cidade deve ser a mesma para toda a família ou grupo.';

export function normalizeFamilyCity(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
}

export function hasMixedFamilyCities(visitors: ReadonlyArray<{ city: string }>): boolean {
  return new Set(visitors.map((visitor) => normalizeFamilyCity(visitor.city))).size > 1;
}
