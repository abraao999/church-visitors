import { Types } from 'mongoose';

export const VEHICLE_ALERTS_LIMIT = 20;
export const EMPTY_ALERT_ID = '000000000000000000000000';

export function encodeVehicleAlertCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}_${id}`;
}

export function parseVehicleAlertCursor(value: unknown): { createdAt: Date; id: string } | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2}T[^\s_]+)_([a-fA-F0-9]{24})$/);
  if (!match) return null;
  const createdAt = new Date(match[1]);
  if (Number.isNaN(createdAt.getTime()) || !Types.ObjectId.isValid(match[2])) return null;
  return { createdAt, id: match[2] };
}

export function alertCursorFilter(createdAt: Date, id: string) {
  return {
    $or: [
      { createdAt: { $gt: createdAt } },
      { createdAt, _id: { $gt: new Types.ObjectId(id) } },
    ],
  };
}
