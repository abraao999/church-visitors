import { sanitizePanelText } from './panelText.js';

export const VEHICLE_PANEL_PAGE_SIZE = 4;
export const VEHICLE_PANEL_ROTATE_MS = 12_000;

export type VehiclePanelLayoutMode =
  | 'empty'
  | 'single'
  | 'pair'
  | 'triple'
  | 'quad'
  | 'paged';

const PANEL_INSTRUCTIONS: Record<string, string> = {
  remove_vehicle: 'POR FAVOR, RETIRE O VEÍCULO',
  turn_off_lights: 'FARÓIS ACESOS',
  close_door_or_window: 'FECHE A PORTA OU JANELA',
  reposition_vehicle: 'REPOSICIONE O VEÍCULO',
};

export function sanitizePanelInstruction(value: string, max = 80): string {
  return sanitizePanelText(value, max);
}

export function vehiclePanelInstruction(
  requestedAction: string,
  otherDescription = ''
): string {
  if (requestedAction === 'other') {
    const custom = sanitizePanelInstruction(otherDescription).toUpperCase();
    return custom || 'ATENÇÃO';
  }
  return PANEL_INSTRUCTIONS[requestedAction] || 'ATENÇÃO';
}

export interface VehiclePanelNotice {
  id: string;
  plate: string;
  vehicleModel: string;
  requestedAction: string;
  instruction: string;
}

export function serializeVehiclePanelNotice(notice: {
  _id: unknown;
  plate: string;
  vehicleModel: string;
  requestedAction: string;
  otherDescription?: string;
}): VehiclePanelNotice {
  return {
    id: String(notice._id),
    plate: notice.plate,
    vehicleModel: notice.vehicleModel,
    requestedAction: notice.requestedAction,
    instruction: vehiclePanelInstruction(notice.requestedAction, notice.otherDescription),
  };
}

export function vehiclePanelLayoutMode(count: number): VehiclePanelLayoutMode {
  if (count <= 0) return 'empty';
  if (count === 1) return 'single';
  if (count === 2) return 'pair';
  if (count === 3) return 'triple';
  if (count === 4) return 'quad';
  return 'paged';
}

export function vehiclePanelPageCount(
  count: number,
  pageSize = VEHICLE_PANEL_PAGE_SIZE
): number {
  if (count <= pageSize) return 1;
  return Math.ceil(count / pageSize);
}

export function sliceVehiclePanelPage<T>(
  items: T[],
  pageIndex: number,
  pageSize = VEHICLE_PANEL_PAGE_SIZE
): T[] {
  if (items.length <= pageSize) return items;
  const safeIndex = ((pageIndex % Math.ceil(items.length / pageSize)) + Math.ceil(items.length / pageSize))
    % Math.ceil(items.length / pageSize);
  const start = safeIndex * pageSize;
  return items.slice(start, start + pageSize);
}

export function activeNoticesLabel(count: number): string {
  return count === 1 ? '1 aviso ativo' : `${count} avisos ativos`;
}

export function describeVehiclePanelChanges(
  previousIds: string[] | null,
  next: Array<{ id: string; plate: string }>
): string {
  if (previousIds === null) return '';
  const previous = new Set(previousIds);
  const fresh = next.filter((item) => !previous.has(item.id));
  if (fresh.length === 1) return `Novo aviso: ${fresh[0].plate}`;
  if (fresh.length > 1) return `${fresh.length} novos avisos de veículos`;
  return '';
}
