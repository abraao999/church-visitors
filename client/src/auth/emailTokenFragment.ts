const TOKEN_PARAM = 'token';

export function readTokenFromHash(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const token = params.get(TOKEN_PARAM)?.trim();
  return token || null;
}

export function stripHashFromLocation(
  history: Pick<History, 'replaceState'>,
  location: Pick<Location, 'pathname' | 'search' | 'hash'>
): string | null {
  const token = readTokenFromHash(location.hash);
  if (location.hash) {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
  return token;
}
