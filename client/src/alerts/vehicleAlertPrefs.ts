import {
  DEFAULT_VEHICLE_ALERT_PREFS,
  type VehicleAlertPrefs,
  type VehicleAlertVolume,
  type VehicleAlertWhen,
} from './vehicleAlertConstants.ts';

export function vehicleAlertStorageKey(userId: string, churchName: string): string {
  return `cv.vehicleAlerts.v1:${userId.trim()}:${churchName.trim().toLowerCase()}`;
}

export function vehicleAlertSeenKey(userId: string, churchName: string): string {
  return `cv.vehicleAlerts.seen.v1:${userId.trim()}:${churchName.trim().toLowerCase()}`;
}

function isVolume(value: unknown): value is VehicleAlertVolume {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isWhen(value: unknown): value is VehicleAlertWhen {
  return value === 'service' || value === 'always';
}

export function parseVehicleAlertPrefs(raw: unknown): VehicleAlertPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_VEHICLE_ALERT_PREFS };
  const value = raw as Record<string, unknown>;
  return {
    enabled: value.enabled === true,
    sound: value.sound !== false,
    inApp: value.inApp !== false,
    browser: value.browser === true,
    when: isWhen(value.when) ? value.when : 'always',
    volume: isVolume(value.volume) ? value.volume : 'medium',
    showPlateInBrowser: value.showPlateInBrowser === true,
  };
}

export function loadVehicleAlertPrefs(userId: string, churchName: string): VehicleAlertPrefs {
  try {
    const raw = localStorage.getItem(vehicleAlertStorageKey(userId, churchName));
    return parseVehicleAlertPrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_VEHICLE_ALERT_PREFS };
  }
}

export function saveVehicleAlertPrefs(
  userId: string,
  churchName: string,
  prefs: VehicleAlertPrefs
): void {
  localStorage.setItem(vehicleAlertStorageKey(userId, churchName), JSON.stringify(prefs));
}

export function clearVehicleAlertStorage(userId: string, churchName: string): void {
  localStorage.removeItem(vehicleAlertStorageKey(userId, churchName));
  localStorage.removeItem(vehicleAlertSeenKey(userId, churchName));
}
