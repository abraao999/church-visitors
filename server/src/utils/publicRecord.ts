import type { Response } from 'express';
import {
  formatCivilDate,
  resolveServiceWindow,
  SERVICE_STATUS_LABELS,
} from './serviceSchedule.js';

/**
 * Recortes das APIs autenticadas. churchId, userId e guestAccessId ficam no
 * banco; o navegador só precisa do que a tela mostra.
 */

export const VISITOR_LIST_FIELDS =
  'name relationship city visitDate source createdBy.name guestAccess.name serviceId createdAt';

export const PRAYER_LIST_FIELDS =
  'name request source isAnonymous allowProjection createdBy.name guestAccess.name serviceId createdAt';

export const SERVICE_LIST_FIELDS =
  'title date time hymns.title hymns.artist hymns.performedBy hymns.addedBy.name createdBy.name createdAt updatedAt recurrenceSeriesId scheduledStartAt durationMinutes activationLeadMinutes cancelledAt closedAt extendedUntil openedAt autoOpenedAt';

export function setPrivateCacheHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie, Authorization');
}

export function sendPrivateJson(res: Response, body: unknown, status?: number) {
  setPrivateCacheHeaders(res);
  if (status != null && status !== 200) {
    return res.status(status).json(body);
  }
  return res.json(body);
}

export function publicPersonName(person?: { name?: string } | null) {
  const name = typeof person?.name === 'string' ? person.name.trim() : '';
  return name ? { name } : undefined;
}

export function serializeVisitor(visitor: {
  _id?: unknown;
  name: string;
  relationship: string;
  city: string;
  visitDate?: Date | string;
  source?: string;
  createdBy?: { name?: string } | null;
  guestAccess?: { name?: string } | null;
  serviceId?: unknown;
  createdAt?: Date | string;
}) {
  return {
    _id: String(visitor._id),
    name: visitor.name,
    relationship: visitor.relationship,
    city: visitor.city,
    visitDate: visitor.visitDate,
    source: visitor.source,
    createdBy: publicPersonName(visitor.createdBy),
    guestAccess: publicPersonName(visitor.guestAccess),
    serviceId: visitor.serviceId ? String(visitor.serviceId) : undefined,
    createdAt: visitor.createdAt,
  };
}

export function serializePrayerRequest(item: {
  _id?: unknown;
  name: string;
  request: string;
  source: string;
  isAnonymous: boolean;
  allowProjection?: boolean;
  createdBy?: { name?: string } | null;
  guestAccess?: { name?: string } | null;
  serviceId?: unknown;
  createdAt?: Date | string;
}) {
  return {
    _id: String(item._id),
    name: item.name,
    request: item.request,
    source: item.source,
    isAnonymous: item.isAnonymous,
    allowProjection: item.allowProjection === true,
    createdBy: publicPersonName(item.createdBy),
    guestAccess: publicPersonName(item.guestAccess),
    serviceId: item.serviceId ? String(item.serviceId) : undefined,
    createdAt: item.createdAt,
  };
}

export function serializeService(
  service: {
    _id?: unknown;
    title: string;
    date: Date | string;
    time?: string;
    hymns?: Array<{
      title: string;
      artist: string;
      performedBy: string;
      addedBy?: { name?: string } | null;
    }>;
    createdBy?: { name?: string } | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    recurrenceSeriesId?: unknown;
    scheduledStartAt?: Date | string | null;
    durationMinutes?: number | null;
    activationLeadMinutes?: number | null;
    cancelledAt?: Date | string | null;
    closedAt?: Date | string | null;
    extendedUntil?: Date | string | null;
    openedAt?: Date | string | null;
    autoOpenedAt?: Date | string | null;
  },
  now = new Date(),
  timeZone?: string
) {
  const dateValue = service.date instanceof Date ? service.date : new Date(service.date);
  const window = resolveServiceWindow(
    {
      date: dateValue,
      time: service.time,
      scheduledStartAt: service.scheduledStartAt ? new Date(service.scheduledStartAt) : null,
      durationMinutes: service.durationMinutes,
      activationLeadMinutes: service.activationLeadMinutes,
      cancelledAt: service.cancelledAt ? new Date(service.cancelledAt) : null,
      closedAt: service.closedAt ? new Date(service.closedAt) : null,
      extendedUntil: service.extendedUntil ? new Date(service.extendedUntil) : null,
      openedAt: service.openedAt ? new Date(service.openedAt) : null,
    },
    now,
    timeZone
  );

  return {
    _id: String(service._id),
    title: service.title,
    date: service.date,
    dateKey: Number.isNaN(dateValue.getTime()) ? '' : formatCivilDate(dateValue, timeZone),
    time: service.time ?? '',
    hymns: (service.hymns ?? []).map((hymn) => ({
      title: hymn.title,
      artist: hymn.artist,
      performedBy: hymn.performedBy,
      addedBy: publicPersonName(hymn.addedBy),
    })),
    createdBy: publicPersonName(service.createdBy),
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
    recurrenceSeriesId: service.recurrenceSeriesId ? String(service.recurrenceSeriesId) : undefined,
    scheduledStartAt: window.scheduledStartAt,
    receptionStartsAt: window.receptionStartsAt,
    endsAt: window.endsAt,
    plannedEndsAt: window.plannedEndsAt,
    durationMinutes: service.durationMinutes ?? undefined,
    activationLeadMinutes: service.activationLeadMinutes ?? undefined,
    cancelledAt: service.cancelledAt ?? undefined,
    closedAt: service.closedAt ?? undefined,
    extendedUntil: service.extendedUntil ?? undefined,
    openedAt: service.openedAt ?? undefined,
    autoOpenedAt: service.autoOpenedAt ?? undefined,
    status: window.status,
    statusLabel: SERVICE_STATUS_LABELS[window.status],
    now,
  };
}
