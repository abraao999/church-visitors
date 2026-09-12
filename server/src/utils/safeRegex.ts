export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizedSearch(value: string, max = 80): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}
