import { VEHICLE_ALERT_SEEN_LIMIT, VEHICLE_ALERT_SEEN_TTL_MS } from './vehicleAlertConstants.ts';
import { vehicleAlertSeenKey } from './vehicleAlertPrefs.ts';

export interface VehicleAlertSeenState {
  cursor: string;
  ids: Record<string, number>;
}

function emptyState(): VehicleAlertSeenState {
  return { cursor: '', ids: {} };
}

function prune(state: VehicleAlertSeenState, now = Date.now()): VehicleAlertSeenState {
  const ids = Object.fromEntries(
    Object.entries(state.ids)
      .filter(([, expires]) => expires > now)
      .sort((left, right) => left[1] - right[1])
      .slice(-VEHICLE_ALERT_SEEN_LIMIT)
  );
  return { cursor: state.cursor, ids };
}

export function parseVehicleAlertSeen(raw: unknown): VehicleAlertSeenState {
  if (!raw || typeof raw !== 'object') return emptyState();
  const value = raw as { cursor?: unknown; ids?: unknown };
  const ids =
    value.ids && typeof value.ids === 'object'
      ? Object.fromEntries(
          Object.entries(value.ids as Record<string, unknown>).filter(
            (entry): entry is [string, number] => typeof entry[1] === 'number'
          )
        )
      : {};
  return prune({
    cursor: typeof value.cursor === 'string' ? value.cursor : '',
    ids,
  });
}

export function loadVehicleAlertSeen(userId: string, churchName: string): VehicleAlertSeenState {
  try {
    const raw = localStorage.getItem(vehicleAlertSeenKey(userId, churchName));
    return parseVehicleAlertSeen(raw ? JSON.parse(raw) : null);
  } catch {
    return emptyState();
  }
}

export function saveVehicleAlertSeen(
  userId: string,
  churchName: string,
  state: VehicleAlertSeenState
): void {
  localStorage.setItem(vehicleAlertSeenKey(userId, churchName), JSON.stringify(prune(state)));
}

export function claimVehicleAlertIds(
  state: VehicleAlertSeenState,
  ids: string[],
  now = Date.now()
): { next: VehicleAlertSeenState; claimed: string[] } {
  const next = prune(state, now);
  const claimed: string[] = [];
  const expires = now + VEHICLE_ALERT_SEEN_TTL_MS;
  for (const id of ids) {
    if (!id || next.ids[id]) continue;
    next.ids[id] = expires;
    claimed.push(id);
  }
  return { next: prune(next, now), claimed };
}

export function rememberVehicleAlertCursor(
  state: VehicleAlertSeenState,
  cursor: string
): VehicleAlertSeenState {
  return { ...state, cursor };
}
