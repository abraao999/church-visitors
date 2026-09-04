const PLATE_CHARS = /[^A-Za-z0-9]/g;
const NORMALIZED_PLATE = /^(?:[A-Z]{3}[0-9]{4}|[A-Z]{3}[0-9][A-Z][0-9]{2})$/;

export function normalizePlateInput(value: string): string {
  return value.replace(PLATE_CHARS, '').toUpperCase().slice(0, 7);
}

export function formatVehiclePlate(normalized: string): string {
  if (normalized.length !== 7) return normalized;
  return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
}

export function maskVehiclePlateInput(raw: string): string {
  const normalized = normalizePlateInput(raw);
  if (normalized.length <= 3) return normalized;
  return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
}

export function isValidVehiclePlate(value: string): boolean {
  return NORMALIZED_PLATE.test(normalizePlateInput(value));
}
