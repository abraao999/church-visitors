const PLATE_CHARS = /[^A-Za-z0-9]/g;

/** Placa antiga: ABC1234 · Mercosul: ABC1D23 */
const NORMALIZED_PLATE = /^(?:[A-Z]{3}[0-9]{4}|[A-Z]{3}[0-9][A-Z][0-9]{2})$/;

export interface ParsedVehiclePlate {
  plate: string;
  plateNormalized: string;
}

export function normalizePlateInput(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(PLATE_CHARS, '').toUpperCase().slice(0, 7);
}

export function formatVehiclePlate(normalized: string): string {
  if (normalized.length !== 7) return normalized;
  return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
}

/**
 * Aceita formatos antigo e Mercosul (com ou sem hífen).
 * Retorna null quando a placa for inválida.
 */
export function parseVehiclePlate(value: unknown): ParsedVehiclePlate | null {
  const plateNormalized = normalizePlateInput(value);
  if (!NORMALIZED_PLATE.test(plateNormalized)) return null;
  return {
    plateNormalized,
    plate: formatVehiclePlate(plateNormalized),
  };
}

/** Máscara progressiva para o formulário (letras maiúsculas + hífen). */
export function maskVehiclePlateInput(raw: string): string {
  const normalized = normalizePlateInput(raw);
  if (normalized.length <= 3) return normalized;
  return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
}
