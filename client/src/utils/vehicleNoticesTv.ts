import type { VehiclePanelNotice } from '../types';

export const VEHICLE_PANEL_PAGE_SIZE = 4;
export const VEHICLE_PANEL_POLL_MS = 12_000;
export const VEHICLE_PANEL_ROTATE_MS = 12_000;

export type { VehiclePanelNotice };

export type VehiclePanelLayoutMode =
  | 'empty'
  | 'single'
  | 'pair'
  | 'triple'
  | 'quad'
  | 'paged';

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
  const pageCount = Math.ceil(items.length / pageSize);
  const safeIndex = ((pageIndex % pageCount) + pageCount) % pageCount;
  return items.slice(safeIndex * pageSize, safeIndex * pageSize + pageSize);
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
