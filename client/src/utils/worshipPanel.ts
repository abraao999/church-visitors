export const WORSHIP_PAGE_SIZE = 3;
export const WORSHIP_ROTATE_MS = 12_000;
export const WORSHIP_POLL_MS = 15_000;
export const WORSHIP_POLL_MAX_MS = 60_000;

export type WorshipEmptyState =
  | 'inactive'
  | 'waiting'
  | 'visitors-empty'
  | 'prayers-empty'
  | 'ready';

export function columnPageCount(count: number, pageSize = WORSHIP_PAGE_SIZE): number {
  if (count <= 0) return 0;
  return Math.ceil(count / pageSize);
}

export function sharedWorshipPageCount(
  visitorCount: number,
  prayerCount: number,
  pageSize = WORSHIP_PAGE_SIZE
): number {
  return Math.max(columnPageCount(visitorCount, pageSize), columnPageCount(prayerCount, pageSize), 0);
}

export function sliceRecycledPage<T>(
  items: T[],
  pageIndex: number,
  pageSize = WORSHIP_PAGE_SIZE
): T[] {
  if (items.length === 0) return [];
  const pages = Math.ceil(items.length / pageSize);
  const safeIndex = ((pageIndex % pages) + pages) % pages;
  return items.slice(safeIndex * pageSize, safeIndex * pageSize + pageSize);
}

export function worshipEmptyState(input: {
  hasActiveService: boolean;
  visitorCount: number;
  prayerCount: number;
}): WorshipEmptyState {
  if (!input.hasActiveService) return 'inactive';
  if (input.visitorCount === 0 && input.prayerCount === 0) return 'waiting';
  if (input.visitorCount === 0) return 'visitors-empty';
  if (input.prayerCount === 0) return 'prayers-empty';
  return 'ready';
}

export function nextPollDelay(failures: number, base = WORSHIP_POLL_MS, max = WORSHIP_POLL_MAX_MS): number {
  if (failures <= 0) return base;
  return Math.min(base * 2 ** Math.min(failures, 3), max);
}

export function sameRecordIds(previous: string[], next: string[]): boolean {
  if (previous.length !== next.length) return false;
  return previous.every((id, index) => id === next[index]);
}

export const WORSHIP_PRIVATE_KEYS = [
  'churchId',
  'userId',
  'createdBy',
  'guestAccessId',
  'requestId',
  'phone',
  'notes',
  'panelObservation',
] as const;

export function worshipPayloadHasPrivateKey(value: unknown, path = ''): string[] {
  if (!value || typeof value !== 'object') return [];
  const found: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (
      key === 'churchId' ||
      key === 'userId' ||
      key === 'createdBy' ||
      key === 'guestAccessId' ||
      key === 'requestId'
    ) {
      found.push(nextPath);
    }
    found.push(...worshipPayloadHasPrivateKey(child, nextPath));
  }
  return found;
}

export const TV_VIEWPORTS = [
  { width: 1280, height: 720, label: '1280×720' },
  { width: 1920, height: 1080, label: '1920×1080' },
  { width: 3840, height: 2160, label: '3840×2160' },
] as const;
