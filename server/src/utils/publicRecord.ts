import type { Response } from 'express';

/**
 * Recortes das APIs autenticadas. churchId, userId e guestAccessId ficam no
 * banco; o navegador só precisa do que a tela mostra.
 */

export const VISITOR_LIST_FIELDS =
  'name relationship city visitDate source createdBy.name guestAccess.name createdAt';

export const PRAYER_LIST_FIELDS =
  'name request source isAnonymous allowProjection createdBy.name guestAccess.name createdAt';

export const SERVICE_LIST_FIELDS =
  'title date time hymns.title hymns.artist hymns.performedBy hymns.addedBy.name createdBy.name createdAt updatedAt';

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
    createdAt: item.createdAt,
  };
}

export function serializeService(service: {
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
}) {
  return {
    _id: String(service._id),
    title: service.title,
    date: service.date,
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
  };
}
