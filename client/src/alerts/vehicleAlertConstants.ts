export const VEHICLE_ALERT_POLL_VISIBLE_MS = 10_000;
export const VEHICLE_ALERT_POLL_HIDDEN_MS = 45_000;
export const VEHICLE_ALERT_TOAST_MS = 30_000;
export const VEHICLE_ALERT_MAX_TOASTS = 2;
export const VEHICLE_ALERT_SEEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const VEHICLE_ALERT_SEEN_LIMIT = 200;

export const VEHICLE_ALERT_VOLUMES = {
  low: 0.06,
  medium: 0.14,
  high: 0.28,
} as const;

export type VehicleAlertVolume = keyof typeof VEHICLE_ALERT_VOLUMES;
export type VehicleAlertWhen = 'service' | 'always';

export interface VehicleAlertPrefs {
  enabled: boolean;
  sound: boolean;
  inApp: boolean;
  browser: boolean;
  when: VehicleAlertWhen;
  volume: VehicleAlertVolume;
  showPlateInBrowser: boolean;
}

export const DEFAULT_VEHICLE_ALERT_PREFS: VehicleAlertPrefs = {
  enabled: false,
  sound: true,
  inApp: true,
  browser: false,
  when: 'always',
  volume: 'medium',
  showPlateInBrowser: false,
};
