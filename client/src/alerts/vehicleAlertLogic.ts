import type { VehicleNoticeAction } from '../types/index.ts';
import { VEHICLE_NOTICE_ACTION_LABELS } from '../types/index.ts';
import { hasPermission } from '../utils/permissions.ts';
import type { VehicleAlertPrefs } from './vehicleAlertConstants.ts';

export interface VehicleAlertNotice {
  id: string;
  plate: string;
  vehicleModel: string;
  requestedAction: VehicleNoticeAction;
  otherDescription?: string;
  status: 'pending' | 'announced' | 'resolved';
  createdAt: string;
  updatedAt: string;
  serviceId?: string;
}

export function formatPendingBadge(count: number): string {
  if (count <= 0) return '';
  return count > 9 ? '9+' : String(count);
}

export function pendingBadgeLabel(count: number): string {
  if (count <= 0) return '';
  const shown = formatPendingBadge(count);
  if (count === 1) return '1 aviso de veículo pendente';
  if (count > 9) return `${shown} avisos de veículos pendentes`;
  return `${count} avisos de veículos pendentes`;
}

export function canReceiveVehicleAlerts(permissions?: readonly string[]): boolean {
  return hasPermission(permissions, 'vehicle_notices:read');
}

export function alertsAreActive(
  prefs: VehicleAlertPrefs,
  operationalService: boolean
): boolean {
  if (!prefs.enabled) return false;
  if (prefs.when === 'service') return operationalService;
  return true;
}

export function shouldNotifyStatus(status: VehicleAlertNotice['status']): boolean {
  return status === 'pending';
}

export function browserNotificationBody(
  prefs: VehicleAlertPrefs,
  notice: Pick<VehicleAlertNotice, 'plate'>
): { title: string; body: string } {
  if (prefs.showPlateInBrowser) {
    return {
      title: 'Novo aviso de veículo',
      body: `Placa ${notice.plate}. Abra o sistema para visualizar.`,
    };
  }
  return {
    title: 'Novo aviso de veículo recebido.',
    body: 'Abra o sistema para visualizar.',
  };
}

export function alertActionLabel(notice: VehicleAlertNotice): string {
  if (notice.requestedAction === 'other' && notice.otherDescription) {
    return notice.otherDescription;
  }
  return VEHICLE_NOTICE_ACTION_LABELS[notice.requestedAction] || 'Aviso de veículo';
}

export function relativeAlertTime(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Agora';
  if (minutes < 60) return `Há ${minutes} minuto${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours} hora${hours === 1 ? '' : 's'}`;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso)
  );
}

export function backoffDelay(failures: number, visible: boolean, visibleMs: number, hiddenMs: number): number {
  const base = visible ? visibleMs : hiddenMs;
  if (failures <= 0) return base;
  return Math.min(base * 2 ** Math.min(failures, 3), 60_000);
}
