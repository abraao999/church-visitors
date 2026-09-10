import { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { FollowUpContact } from '../models/FollowUpContact.js';
import { GuestAccess } from '../models/GuestAccess.js';
import { PrayerRequest } from '../models/PrayerRequest.js';
import { PublicAccessEvent } from '../models/PublicAccessEvent.js';
import { ReportDailySummary } from '../models/ReportDailySummary.js';
import { Service } from '../models/Service.js';
import { VehicleNotice } from '../models/VehicleNotice.js';
import { Visitor } from '../models/Visitor.js';
import { VisitorFollowUp } from '../models/VisitorFollowUp.js';
import { churchTimezone } from '../utils/serviceSchedule.js';
import { civilInZone } from '../utils/dayRange.js';
import {
  compareCounts,
  dateKeyInZone,
  eventTime,
  previousEquivalentRange,
  startOfWeekSunday,
  type ReportRange,
} from '../utils/reportRange.js';
import { withChurch } from '../utils/tenant.js';

export type ReportSourceFilter = 'owner' | 'guest_access' | 'portaria_device' | 'all';

function asObjectId(churchId: string) {
  return new Types.ObjectId(churchId);
}

function increment(map: Record<string, number>, key: string, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function topEntries(map: Record<string, number>, limit = 8) {
  return Object.entries(map)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function sourceLabel(source?: string) {
  if (source === 'guest_access') return 'Portal público';
  if (source === 'portaria_device' || source === 'porteiro') return 'Portaria';
  return 'Responsável';
}

export async function timezoneForReports(churchId: string): Promise<string> {
  const church = await Church.findById(churchId).select('timezone name');
  return churchTimezone(church?.timezone);
}

export async function churchNameForReports(churchId: string): Promise<string> {
  const church = await Church.findById(churchId).select('name');
  return church?.name || 'Igreja';
}

function visitorTimeFilter(range: ReportRange) {
  return {
    $or: [
      { capturedAt: { $gte: range.from, $lte: range.to } },
      { capturedAt: { $exists: false }, visitDate: { $gte: range.from, $lte: range.to } },
      { capturedAt: { $exists: false }, createdAt: { $gte: range.from, $lte: range.to } },
    ],
  };
}

export async function loadReportScope(
  churchId: string,
  range: ReportRange,
  options: { serviceId?: string; source?: ReportSourceFilter } = {}
) {
  const source = options.source && options.source !== 'all' ? { source: options.source } : {};
  const service = options.serviceId ? { serviceId: new Types.ObjectId(options.serviceId) } : {};
  const [visitors, prayers, vehicles, services, summaries] = await Promise.all([
    Visitor.find(withChurch(churchId, { anonymizedAt: { $exists: false }, ...visitorTimeFilter(range), ...source, ...service }))
      .select('city source visitDate createdAt capturedAt visitKind serviceId')
      .lean(),
    PrayerRequest.find(
      withChurch(churchId, {
        createdAt: { $gte: range.from, $lte: range.to },
        ...service,
      })
    )
      .select('source allowProjection careStatus serviceId createdAt')
      .lean(),
    VehicleNotice.find(
      withChurch(churchId, {
        $or: [
          { capturedAt: { $gte: range.from, $lte: range.to } },
          { capturedAt: { $exists: false }, createdAt: { $gte: range.from, $lte: range.to } },
        ],
        ...source,
        ...service,
      })
    )
      .select('status source requestedAction capturedAt createdAt announcedAt resolvedAt serviceId')
      .lean(),
    Service.find(
      withChurch(churchId, {
        $or: [
          { scheduledStartAt: { $gte: range.from, $lte: range.to } },
          { date: { $gte: range.from, $lte: range.to } },
        ],
        ...(options.serviceId ? { _id: new Types.ObjectId(options.serviceId) } : {}),
      })
    )
      .select('title date time scheduledStartAt hymns cancelledAt closedAt')
      .lean(),
    ReportDailySummary.find(
      withChurch(churchId, {
        dateKey: { $gte: range.fromKey, $lte: range.toKey },
      })
    )
      .select(
        'dateKey visitors firstVisits returningVisits unknownVisits prayers vehicleNotices followUps followUpContacts followUpsClosed cities visitorSources'
      )
      .lean(),
  ]);

  return { visitors, prayers, vehicles, services, summaries };
}

function visitorKind(visitor: { visitKind?: string }) {
  if (visitor.visitKind === 'first' || visitor.visitKind === 'returning') return visitor.visitKind;
  return 'unknown';
}

export function aggregateVisitors(
  visitors: Array<{
    city?: string;
    source?: string;
    visitDate?: Date;
    createdAt?: Date;
    capturedAt?: Date;
    visitKind?: string;
    serviceId?: unknown;
  }>,
  summaries: Array<{
    dateKey?: string;
    visitors?: number;
    firstVisits?: number;
    returningVisits?: number;
    unknownVisits?: number;
    prayers?: number;
    vehicleNotices?: number;
    cities?: Record<string, number>;
    visitorSources?: Record<string, number>;
  }>,
  timeZone: string
) {
  const byDay: Record<string, number> = {};
  const byWeek: Record<string, number> = {};
  const cities: Record<string, number> = {};
  const sources: Record<string, number> = {};
  const hours: Record<string, number> = {};
  const byService: Record<string, number> = {};
  let first = 0;
  let returning = 0;
  let unknown = 0;

  for (const visitor of visitors) {
    const when = eventTime(visitor);
    const key = dateKeyInZone(visitor.visitDate || when, timeZone);
    increment(byDay, key);
    increment(byWeek, dateKeyInZone(startOfWeekSunday(visitor.visitDate || when, timeZone), timeZone));
    increment(cities, (visitor.city || 'Não informada').trim() || 'Não informada');
    increment(sources, sourceLabel(visitor.source));
    increment(hours, `${String(civilInZone(when, timeZone).hour).padStart(2, '0')}h`);
    if (visitor.serviceId) increment(byService, String(visitor.serviceId));
    const kind = visitorKind(visitor);
    if (kind === 'first') first += 1;
    else if (kind === 'returning') returning += 1;
    else unknown += 1;
  }

  let historic = 0;
  for (const summary of summaries) {
    historic += summary.visitors || 0;
    first += summary.firstVisits || 0;
    returning += summary.returningVisits || 0;
    unknown += summary.unknownVisits || 0;
    if (summary.dateKey && summary.visitors) increment(byDay, summary.dateKey, summary.visitors);
    for (const [city, value] of Object.entries(summary.cities || {})) increment(cities, city, value);
    for (const [source, value] of Object.entries(summary.visitorSources || {})) {
      increment(sources, sourceLabel(source), value);
    }
  }

  return {
    total: visitors.length + historic,
    first,
    returning,
    unknown,
    byDay: Object.entries(byDay)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, value]) => ({ label, value })),
    byWeek: Object.entries(byWeek)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, value]) => ({ label, value })),
    byMonth: Object.entries(
      Object.entries(byDay).reduce<Record<string, number>>((acc, [day, value]) => {
        increment(acc, day.slice(0, 7), value);
        return acc;
      }, {})
    )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, value]) => ({ label, value })),
    cities: topEntries(cities),
    sources: Object.entries(sources).map(([label, value]) => ({ label, value })),
    hours: Object.entries(hours)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, value]) => ({ label, value })),
    byService,
  };
}

export async function buildOverview(
  churchId: string,
  range: ReportRange,
  options: { serviceId?: string; source?: ReportSourceFilter } = {}
) {
  const timeZone = await timezoneForReports(churchId);
  const current = await loadReportScope(churchId, range, options);
  const previous = await loadReportScope(churchId, previousEquivalentRange(range, timeZone), options);
  const visitors = aggregateVisitors(current.visitors, current.summaries, timeZone);
  const previousVisitors = aggregateVisitors(previous.visitors, previous.summaries, timeZone);
  const serviceCount = current.services.length;
  const previousServiceCount = previous.services.length;
  const average = serviceCount > 0 ? Math.round((visitors.total / serviceCount) * 10) / 10 : null;
  const previousAverage =
    previousServiceCount > 0 ? Math.round((previousVisitors.total / previousServiceCount) * 10) / 10 : null;
  const prayersFollowed = current.prayers.filter(
    (item) => item.careStatus === 'in_follow_up' || item.careStatus === 'completed'
  ).length;
  const vehiclesResolved = current.vehicles.filter((item) => item.status === 'resolved').length;

  return {
    generatedAt: new Date().toISOString(),
    churchName: await churchNameForReports(churchId),
    range: { from: range.fromKey, to: range.toKey, preset: range.preset },
    cards: {
      visitors: compareCounts(visitors.total, previousVisitors.total),
      averagePerService: {
        current: average,
        previous: previousAverage,
        delta: average != null && previousAverage != null ? Math.round((average - previousAverage) * 10) / 10 : null,
        percent:
          average != null && previousAverage != null && previousAverage !== 0
            ? Math.round(((average - previousAverage) / previousAverage) * 1000) / 10
            : null,
      },
      prayers: compareCounts(
        current.prayers.length + current.summaries.reduce((sum, item) => sum + (item.prayers || 0), 0),
        previous.prayers.length + previous.summaries.reduce((sum, item) => sum + (item.prayers || 0), 0)
      ),
      prayersFollowed,
      vehicles: compareCounts(
        current.vehicles.length + current.summaries.reduce((sum, item) => sum + (item.vehicleNotices || 0), 0),
        previous.vehicles.length + previous.summaries.reduce((sum, item) => sum + (item.vehicleNotices || 0), 0)
      ),
      vehiclesResolved,
    },
    charts: {
      visitorsByWeek: visitors.byWeek,
      previousVisitorsByWeek: previousVisitors.byWeek,
      cities: visitors.cities,
      sources: visitors.sources,
      firstVsReturning: [
        { label: 'Primeira visita', value: visitors.first },
        { label: 'Retornos', value: visitors.returning },
        { label: 'Não informado', value: visitors.unknown },
      ],
      gateHours: visitors.hours,
    },
    historicRemoved: current.summaries.length > 0,
  };
}

export async function buildVisitorReport(
  churchId: string,
  range: ReportRange,
  options: { serviceId?: string; source?: ReportSourceFilter } = {}
) {
  const timeZone = await timezoneForReports(churchId);
  const current = await loadReportScope(churchId, range, options);
  const previous = await loadReportScope(churchId, previousEquivalentRange(range, timeZone), options);
  const visitors = aggregateVisitors(current.visitors, current.summaries, timeZone);
  const previousVisitors = aggregateVisitors(previous.visitors, previous.summaries, timeZone);
  const historicFollowUps = current.summaries.reduce((sum, item) => sum + (item.followUps || 0), 0);
  const followUps =
    (await VisitorFollowUp.countDocuments(
      withChurch(churchId, {
        createdAt: { $gte: range.from, $lte: range.to },
        anonymizedAt: { $exists: false },
      })
    )) + historicFollowUps;
  const serviceCount = current.services.length;
  return {
    totals: compareCounts(visitors.total, previousVisitors.total),
    averagePerService: serviceCount > 0 ? Math.round((visitors.total / serviceCount) * 10) / 10 : null,
    first: visitors.first,
    returning: visitors.returning,
    unknown: visitors.unknown,
    byDay: visitors.byDay,
    byWeek: visitors.byWeek,
    byMonth: visitors.byMonth,
    cities: visitors.cities,
    sources: visitors.sources,
    followUps,
    services: current.services.map((service) => ({
      id: String(service._id),
      title: service.title,
      visitors: visitors.byService[String(service._id)] || 0,
    })),
  };
}

export async function buildFollowUpReport(churchId: string, range: ReportRange) {
  const items = await VisitorFollowUp.find(
    withChurch(churchId, {
      createdAt: { $lte: range.to },
      anonymizedAt: { $exists: false },
    })
  )
    .select('status nextContactAt assignedToName consent visitorId')
    .lean();
  const [contacts, summaries] = await Promise.all([
    FollowUpContact.countDocuments(
      withChurch(churchId, { createdAt: { $gte: range.from, $lte: range.to } })
    ),
    ReportDailySummary.find(
      withChurch(churchId, {
        dateKey: { $lte: range.toKey },
      })
    )
      .select('followUps followUpContacts followUpsClosed')
      .lean(),
  ]);
  const historicFollowUps = summaries.reduce((sum, item) => sum + (item.followUps || 0), 0);
  const historicContacts = summaries.reduce((sum, item) => sum + (item.followUpContacts || 0), 0);
  const historicClosed = summaries.reduce((sum, item) => sum + (item.followUpsClosed || 0), 0);
  const now = new Date();
  const byAssignee: Record<string, number> = {};
  let awaiting = 0;
  let contacted = 0;
  let integrating = 0;
  let closed = 0;
  let due = 0;
  let overdue = 0;
  for (const item of items) {
    if (item.status === 'awaiting') awaiting += 1;
    else if (item.status === 'contacted') contacted += 1;
    else if (item.status === 'integrating') integrating += 1;
    else if (item.status === 'closed') closed += 1;
    increment(byAssignee, item.assignedToName || 'Definir depois');
    if (item.nextContactAt) {
      if (item.nextContactAt.getTime() <= now.getTime() && item.status !== 'closed') overdue += 1;
      else if (item.status !== 'closed') due += 1;
    }
  }
  return {
    included: items.length + historicFollowUps,
    awaiting,
    contacted,
    integrating,
    closed: closed + historicClosed,
    due,
    overdue,
    contacts: contacts + historicContacts,
    historicRemoved: historicFollowUps > 0 || historicContacts > 0,
    assignees: topEntries(byAssignee),
  };
}

export async function buildPrayerReport(
  churchId: string,
  range: ReportRange,
  options: { serviceId?: string } = {}
) {
  const timeZone = await timezoneForReports(churchId);
  const current = await loadReportScope(churchId, range, options);
  const previous = await loadReportScope(churchId, previousEquivalentRange(range, timeZone), options);
  const historicPrayers = current.summaries.reduce((sum, item) => sum + (item.prayers || 0), 0);
  const previousHistoric = previous.summaries.reduce((sum, item) => sum + (item.prayers || 0), 0);
  const byStatus: Record<string, number> = { new: 0, acknowledged: 0, in_follow_up: 0, completed: 0 };
  const sources: Record<string, number> = {};
  let projected = 0;
  for (const prayer of current.prayers) {
    increment(byStatus, prayer.careStatus || 'new');
    increment(sources, sourceLabel(prayer.source));
    if (prayer.allowProjection) projected += 1;
  }
  return {
    totals: compareCounts(current.prayers.length + historicPrayers, previous.prayers.length + previousHistoric),
    byStatus,
    projected,
    historicRemoved: historicPrayers > 0,
    sources: Object.entries(sources).map(([label, value]) => ({ label, value })),
  };
}

function averageMs(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export async function buildVehicleReport(
  churchId: string,
  range: ReportRange,
  options: { serviceId?: string; source?: ReportSourceFilter } = {}
) {
  const timeZone = await timezoneForReports(churchId);
  const current = await loadReportScope(churchId, range, options);
  const hours: Record<string, number> = {};
  const actions: Record<string, number> = {};
  const sources: Record<string, number> = {};
  const announceTimes: number[] = [];
  const resolveTimes: number[] = [];
  let pending = 0;
  let announced = 0;
  let resolved = 0;
  for (const notice of current.vehicles) {
    const when = eventTime(notice);
    increment(hours, `${String(civilInZone(when, timeZone).hour).padStart(2, '0')}h`);
    increment(actions, notice.requestedAction);
    increment(sources, sourceLabel(notice.source));
    if (notice.status === 'pending') pending += 1;
    if (notice.status === 'announced') announced += 1;
    if (notice.status === 'resolved') resolved += 1;
    const start = when.getTime();
    if (notice.announcedAt) announceTimes.push(notice.announcedAt.getTime() - start);
    if (notice.resolvedAt) resolveTimes.push(notice.resolvedAt.getTime() - start);
  }
  const historicVehicles = current.summaries.reduce((sum, item) => sum + (item.vehicleNotices || 0), 0);
  return {
    total: current.vehicles.length + historicVehicles,
    historicRemoved: historicVehicles > 0,
    pending,
    announced,
    resolved,
    actions: Object.entries(actions).map(([label, value]) => ({ label, value })),
    sources: Object.entries(sources).map(([label, value]) => ({ label, value })),
    hours: Object.entries(hours)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, value]) => ({ label, value })),
    averageAnnounceMs: averageMs(announceTimes),
    averageResolveMs: averageMs(resolveTimes),
  };
}

export async function buildAccessReport(churchId: string, range: ReportRange) {
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 86_400_000);
  const accesses = await GuestAccess.find(withChurch(churchId, { type: { $ne: 'panels:read' } }))
    .select('active expiresAt lastUsedAt types type name')
    .lean();
  const events = await PublicAccessEvent.find(
    withChurch(churchId, { createdAt: { $gte: range.from, $lte: range.to } })
  )
    .select('type channel purpose guestAccessId')
    .lean();
  const submissionsByAccess: Record<string, number> = {};
  const purposes: Record<string, number> = {};
  let opened = 0;
  let started = 0;
  let submitted = 0;
  let qr = 0;
  let link = 0;
  for (const event of events) {
    if (event.type === 'opened') opened += 1;
    if (event.type === 'form_started') started += 1;
    if (event.type === 'submitted') {
      submitted += 1;
      increment(submissionsByAccess, String(event.guestAccessId));
    }
    if (event.channel === 'qr') qr += 1;
    else link += 1;
    increment(purposes, event.purpose || 'acesso');
  }
  return {
    active: accesses.filter((item) => item.active && (!item.expiresAt || item.expiresAt > now)).length,
    expired: accesses.filter((item) => item.expiresAt && item.expiresAt <= now).length,
    expiringSoon: accesses.filter(
      (item) => item.active && item.expiresAt && item.expiresAt > now && item.expiresAt <= soon
    ).length,
    lastUsed: accesses
      .filter((item) => item.lastUsedAt)
      .sort((left, right) => (right.lastUsedAt?.getTime() || 0) - (left.lastUsedAt?.getTime() || 0))
      .slice(0, 6)
      .map((item) => ({
        name: item.name,
        lastUsedAt: item.lastUsedAt,
      })),
    submissionsByAccess: accesses.map((item) => ({
      name: item.name,
      submissions: submissionsByAccess[String(item._id)] || 0,
    })),
    purposes: Object.entries(purposes).map(([label, value]) => ({ label, value })),
    opened,
    started,
    submitted,
    completionRate: opened > 0 ? Math.round((submitted / opened) * 1000) / 10 : null,
    qr,
    sharedLink: link,
  };
}

export async function buildServiceReport(churchId: string, serviceId: string, range: ReportRange) {
  const service = await Service.findOne(withChurch(churchId, { _id: serviceId })).lean();
  if (!service) return null;
  const scoped = await loadReportScope(churchId, range, { serviceId });
  const timeZone = await timezoneForReports(churchId);
  const visitors = aggregateVisitors(scoped.visitors, [], timeZone);
  const vehicles = await buildVehicleReport(churchId, range, { serviceId });
  return {
    service: {
      id: String(service._id),
      title: service.title,
      date: service.date,
      time: service.time,
      cancelledAt: service.cancelledAt,
      closedAt: service.closedAt,
      hymns: (service.hymns || []).map((hymn: { title: string; artist?: string }) => ({
        title: hymn.title,
        artist: hymn.artist || '',
      })),
    },
    visitors,
    prayers: scoped.prayers.length,
    vehicles,
  };
}

export async function consentedFollowUpRows(churchId: string, range: ReportRange) {
  const followUps = await VisitorFollowUp.find(
    withChurch(churchId, {
      consent: true,
      anonymizedAt: { $exists: false },
      createdAt: { $lte: range.to },
    })
  ).lean();
  const visitorIds = followUps.map((item) => item.visitorId);
  const visitors = await Visitor.find(withChurch(churchId, { _id: { $in: visitorIds } }))
    .select('name city visitDate serviceId')
    .lean();
  const visitorMap = new Map(visitors.map((item) => [String(item._id), item]));
  const lastContacts = await FollowUpContact.find(withChurch(churchId, { visitorId: { $in: visitorIds } }))
    .select('visitorId createdAt')
    .sort({ createdAt: -1 })
    .lean();
  const lastByVisitor = new Map<string, Date>();
  for (const contact of lastContacts) {
    const key = String(contact.visitorId);
    if (!lastByVisitor.has(key)) lastByVisitor.set(key, contact.createdAt);
  }
  return followUps.map((item) => {
    const visitor = visitorMap.get(String(item.visitorId));
    return {
      name: visitor?.name || 'Visitante',
      city: visitor?.city || '',
      phone: item.phone || '',
      visitDate: visitor?.visitDate,
      serviceId: visitor?.serviceId ? String(visitor.serviceId) : '',
      assignedToName: item.assignedToName || '',
      status: item.status,
      nextContactAt: item.nextContactAt,
      lastContactAt: lastByVisitor.get(String(item.visitorId)),
    };
  });
}

export async function upsertDailySummary(
  churchId: string,
  dateKey: string,
  patch: {
    visitors?: number;
    firstVisits?: number;
    returningVisits?: number;
    unknownVisits?: number;
    prayers?: number;
    vehicleNotices?: number;
    followUps?: number;
    followUpContacts?: number;
    followUpsClosed?: number;
    cities?: Record<string, number>;
    visitorSources?: Record<string, number>;
  }
) {
  const existing = await ReportDailySummary.findOne(withChurch(churchId, { dateKey }));
  const cities = { ...(existing?.cities || {}) };
  const visitorSources = { ...(existing?.visitorSources || {}) };
  for (const [city, value] of Object.entries(patch.cities || {})) increment(cities, city, value);
  for (const [source, value] of Object.entries(patch.visitorSources || {})) {
    increment(visitorSources, source, value);
  }
  await ReportDailySummary.updateOne(
    withChurch(churchId, { dateKey }),
    {
      $inc: {
        visitors: patch.visitors || 0,
        firstVisits: patch.firstVisits || 0,
        returningVisits: patch.returningVisits || 0,
        unknownVisits: patch.unknownVisits || 0,
        prayers: patch.prayers || 0,
        vehicleNotices: patch.vehicleNotices || 0,
        followUps: patch.followUps || 0,
        followUpContacts: patch.followUpContacts || 0,
        followUpsClosed: patch.followUpsClosed || 0,
      },
      $set: { cities, visitorSources },
      $setOnInsert: { churchId: asObjectId(churchId), dateKey },
    },
    { upsert: true }
  );
}

export async function recordRetentionSummaries(
  churchId: string,
  visitors: Array<{
    visitDate?: Date;
    createdAt?: Date;
    city?: string;
    source?: string;
    visitKind?: string;
  }>,
  prayers: Array<{ createdAt?: Date }>,
  vehicles: Array<{ createdAt?: Date; capturedAt?: Date }>,
  timeZone: string,
  followUps: Array<{ createdAt?: Date; status?: string }> = [],
  contacts: Array<{ createdAt?: Date }> = []
) {
  const byDay = new Map<
    string,
    {
      visitors: number;
      firstVisits: number;
      returningVisits: number;
      unknownVisits: number;
      prayers: number;
      vehicleNotices: number;
      followUps: number;
      followUpContacts: number;
      followUpsClosed: number;
      cities: Record<string, number>;
      visitorSources: Record<string, number>;
    }
  >();

  function day(key: string) {
    const current = byDay.get(key) || {
      visitors: 0,
      firstVisits: 0,
      returningVisits: 0,
      unknownVisits: 0,
      prayers: 0,
      vehicleNotices: 0,
      followUps: 0,
      followUpContacts: 0,
      followUpsClosed: 0,
      cities: {},
      visitorSources: {},
    };
    byDay.set(key, current);
    return current;
  }

  for (const visitor of visitors) {
    const current = day(dateKeyInZone(visitor.visitDate || visitor.createdAt || new Date(), timeZone));
    current.visitors += 1;
    const kind = visitorKind(visitor);
    if (kind === 'first') current.firstVisits += 1;
    else if (kind === 'returning') current.returningVisits += 1;
    else current.unknownVisits += 1;
    increment(current.cities, visitor.city || 'Não informada');
    increment(current.visitorSources, visitor.source || 'owner');
  }
  for (const prayer of prayers) {
    day(dateKeyInZone(prayer.createdAt || new Date(), timeZone)).prayers += 1;
  }
  for (const notice of vehicles) {
    day(dateKeyInZone(eventTime(notice), timeZone)).vehicleNotices += 1;
  }
  for (const followUp of followUps) {
    const current = day(dateKeyInZone(followUp.createdAt || new Date(), timeZone));
    current.followUps += 1;
    if (followUp.status === 'closed') current.followUpsClosed += 1;
  }
  for (const contact of contacts) {
    day(dateKeyInZone(contact.createdAt || new Date(), timeZone)).followUpContacts += 1;
  }
  for (const [dateKey, values] of byDay) {
    await upsertDailySummary(churchId, dateKey, values);
  }
}

export { asObjectId };
