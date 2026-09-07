import {
  GUEST_ACCESS_TYPES,
  isPanelGuestAccessType,
  type GuestAccessType,
} from '../models/GuestAccess.js';

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

/**
 * Um mesmo link não pode servir formulário de visitante e painel de TV: o de
 * painel fica exposto num computador da igreja e o de formulário circula entre
 * visitantes. Misturar transformaria um vazamento de link em vazamento de dados.
 */
export function mixesPanelAndFormScopes(types: GuestAccessType[]): boolean {
  return types.some(isPanelGuestAccessType) && types.some((type) => !isPanelGuestAccessType(type));
}

export function isPanelOnlyAccess(types: GuestAccessType[]): boolean {
  return types.length > 0 && types.every(isPanelGuestAccessType);
}
