import { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { Service, type IService } from '../models/Service.js';
import {
  addCivilDays,
  churchTimezone,
  endOfDay,
  isOperationalStatus,
  operationalWindow,
  resolveServiceStatus,
  scheduledStartOf,
  startOfDay,
  windowsOverlap,
  type ServiceScheduleInput,
} from '../utils/serviceSchedule.js';
import { withChurch } from '../utils/tenant.js';

export async function timezoneForChurch(churchId: string): Promise<string> {
  const church = await Church.findById(churchId).select('timezone');
  return churchTimezone(church?.timezone);
}

export function asSchedule(service: IService): ServiceScheduleInput {
  return {
    date: service.date,
    time: service.time,
    scheduledStartAt: service.scheduledStartAt,
    durationMinutes: service.durationMinutes,
    activationLeadMinutes: service.activationLeadMinutes,
    cancelledAt: service.cancelledAt,
    closedAt: service.closedAt,
    extendedUntil: service.extendedUntil,
    openedAt: service.openedAt,
  };
}

async function nearbyServices(churchId: string, now: Date, timeZone: string) {
  const from = startOfDay(addCivilDays(now, -1, timeZone), timeZone);
  const to = endOfDay(addCivilDays(now, 1, timeZone), timeZone);
  return Service.find(
    withChurch(churchId, {
      cancelledAt: { $exists: false },
      closedAt: { $exists: false },
      $or: [
        { scheduledStartAt: { $gte: from, $lte: to } },
        { date: { $gte: from, $lte: to } },
      ],
    })
  );
}

export async function resolveActiveService(
  churchId: string,
  now = new Date(),
  timeZone?: string
): Promise<IService | null> {
  const tz = timeZone || (await timezoneForChurch(churchId));
  const services = await nearbyServices(churchId, now, tz);
  const operational = services
    .filter((service) => isOperationalStatus(resolveServiceStatus(asSchedule(service), now, tz)))
    .sort((left, right) => {
      const a = scheduledStartOf(asSchedule(left), tz)?.getTime() ?? 0;
      const b = scheduledStartOf(asSchedule(right), tz)?.getTime() ?? 0;
      return a - b;
    });

  const active = operational[0];
  if (!active) return null;

  if (!active.autoOpenedAt) {
    await Service.updateOne(
      { _id: active._id, churchId: active.churchId, autoOpenedAt: { $exists: false } },
      { $set: { autoOpenedAt: now } }
    ).catch(() => undefined);
  }

  return active;
}

export async function findOverlappingService(
  churchId: string,
  window: { start: Date; end: Date },
  exceptIds: Array<string | Types.ObjectId> = [],
  timeZone?: string
): Promise<IService | null> {
  const tz = timeZone || (await timezoneForChurch(churchId));
  const from = startOfDay(addCivilDays(window.start, -1, tz), tz);
  const to = endOfDay(addCivilDays(window.end, 1, tz), tz);
  const except = exceptIds.map((id) => new Types.ObjectId(String(id)));
  const services = await Service.find(
    withChurch(churchId, {
      cancelledAt: { $exists: false },
      closedAt: { $exists: false },
      ...(except.length ? { _id: { $nin: except } } : {}),
      $or: [
        { scheduledStartAt: { $gte: from, $lte: to } },
        { date: { $gte: from, $lte: to } },
      ],
    })
  );

  for (const service of services) {
    const other = operationalWindow(asSchedule(service), tz);
    if (other && windowsOverlap(window, other)) return service;
  }
  return null;
}

export async function loadChurchService(
  churchId: string,
  serviceId: unknown
): Promise<IService | null> {
  if (typeof serviceId !== 'string' || !Types.ObjectId.isValid(serviceId)) return null;
  return Service.findOne({ _id: serviceId, churchId });
}

export async function resolveLinkedServiceId(
  churchId: string,
  requestedId: unknown,
  options: { allowChoose?: boolean } = {}
): Promise<{ serviceId?: Types.ObjectId; error?: string }> {
  if (requestedId !== undefined && requestedId !== null && requestedId !== '') {
    if (!options.allowChoose) {
      return { error: 'O culto não pode ser escolhido neste envio.' };
    }
    const service = await loadChurchService(churchId, requestedId);
    if (!service) {
      return { error: 'Este culto não pertence à sua igreja.' };
    }
    return { serviceId: service._id as Types.ObjectId };
  }

  const active = await resolveActiveService(churchId);
  return active ? { serviceId: active._id as Types.ObjectId } : {};
}
