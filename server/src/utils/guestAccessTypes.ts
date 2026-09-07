import { GUEST_ACCESS_TYPES, type GuestAccessType } from '../models/GuestAccess.js';

export function isGuestAccessType(value: unknown): value is GuestAccessType {
  return GUEST_ACCESS_TYPES.includes(value as GuestAccessType);
}

export function parseGuestAccessTypes(
  input: unknown,
  fallbackType?: unknown
): GuestAccessType[] {
  const collected: GuestAccessType[] = [];

  if (Array.isArray(input)) {
    for (const item of input) {
      if (isGuestAccessType(item) && !collected.includes(item)) {
        collected.push(item);
      }
    }
  } else if (isGuestAccessType(input)) {
    collected.push(input);
  }

  if (collected.length === 0 && isGuestAccessType(fallbackType)) {
    collected.push(fallbackType);
  }

  return GUEST_ACCESS_TYPES.filter((type) => collected.includes(type));
}

export function resolveGuestAccessTypes(access: {
  type?: unknown;
  types?: unknown;
}): GuestAccessType[] {
  return parseGuestAccessTypes(access.types, access.type);
}

export function guestAccessHasScope(
  access: { type?: unknown; types?: unknown },
  scope: GuestAccessType
): boolean {
  return resolveGuestAccessTypes(access).includes(scope);
}
