import { Types } from 'mongoose';
import type { IActor } from '../models/Actor.js';
import { RecurrenceSeries, type IRecurrenceSeries } from '../models/RecurrenceSeries.js';
import { Service, type IHymn, type IService } from '../models/Service.js';
import { findOverlappingService, timezoneForChurch } from './activeService.js';
import {
  addMinutes,
  alignToWeekday,
  buildOccurrenceDates,
  combineDateAndTime,
  conflictMessage,
  DEFAULT_DURATION_MINUTES,
  DEFAULT_LEAD_MINUTES,
  operationalWindow,
  parseClock,
  parseDateInput,
  parseDurationMinutes,
  parseFrequency,
  parseRequestId,
  previewLimitsError,
  weekdayInZone,
  type RecurrenceFrequency,
} from '../utils/serviceSchedule.js';
import { withChurch } from '../utils/tenant.js';

export type EditScope = 'this' | 'thisAndFuture';

export interface ServiceWriteInput {
  title: string;
  date: Date;
  time: string;
  durationMinutes: number;
  activationLeadMinutes: number;
  hymns: IHymn[];
  recurring: boolean;
  frequency?: RecurrenceFrequency;
  weekday?: number;
  endDate?: Date;
  requestId?: string;
}

export function parseServiceWrite(
  body: Record<string, unknown>,
  options: { requireTime?: boolean; allowRecurring?: boolean } = {}
): { data: ServiceWriteInput; error?: undefined } | { error: string; data?: undefined } {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const time = parseClock(body.time) ?? (typeof body.time === 'string' && !body.time.trim() ? '' : null);
  const date = parseDateInput(body.date);
  const durationMinutes = parseDurationMinutes(body.durationMinutes) ?? DEFAULT_DURATION_MINUTES;
  const recurring = options.allowRecurring !== false && (body.recurring === true || body.recurring === 'true');
  const frequency = parseFrequency(body.frequency) ?? 'weekly';
  const endDate = parseDateInput(body.endDate);
  const weekdayRaw = typeof body.weekday === 'number' ? body.weekday : Number(body.weekday);
  const requestId = parseRequestId(body.requestId);

  if (!title) return { error: 'Título do culto é obrigatório' };
  if (!date) return { error: 'Data do culto é obrigatória' };
  if (time === null) return { error: 'Informe um horário válido' };
  if ((options.requireTime || recurring) && !time) {
    return { error: 'Horário é obrigatório para este culto' };
  }

  if (recurring) {
    if (!endDate) return { error: 'Informe até quando o culto deve se repetir' };
    const weekday = Number.isInteger(weekdayRaw) && weekdayRaw >= 0 && weekdayRaw <= 6
      ? weekdayRaw
      : weekdayInZone(date);
    return {
      data: {
        title,
        date,
        time,
        durationMinutes,
        activationLeadMinutes: DEFAULT_LEAD_MINUTES,
        hymns: [],
        recurring: true,
        frequency,
        weekday,
        endDate,
        requestId,
      },
    };
  }

  return {
    data: {
      title,
      date,
      time,
      durationMinutes,
      activationLeadMinutes: DEFAULT_LEAD_MINUTES,
      hymns: [],
      recurring: false,
      requestId,
    },
  };
}

function scheduledFields(
  date: Date,
  time: string,
  durationMinutes: number,
  timeZone: string
) {
  const scheduledStartAt = time ? combineDateAndTime(date, time, timeZone) : undefined;
  return {
    date,
    time,
    durationMinutes,
    activationLeadMinutes: DEFAULT_LEAD_MINUTES,
    scheduledStartAt,
  };
}

export async function assertNoOverlap(
  churchId: string,
  service: {
    date: Date;
    time?: string;
    scheduledStartAt?: Date | null;
    durationMinutes?: number | null;
    activationLeadMinutes?: number | null;
    extendedUntil?: Date | null;
  },
  exceptIds: Array<string | Types.ObjectId> = [],
  timeZone?: string
) {
  const tz = timeZone || (await timezoneForChurch(churchId));
  const window = operationalWindow(service, tz);
  if (!window) return;
  const conflict = await findOverlappingService(churchId, window, exceptIds, tz);
  if (conflict) {
    throw Object.assign(new Error(conflictMessage(conflict.title)), { status: 409 });
  }
}

export async function createServices(input: {
  churchId: string;
  actor: IActor;
  data: ServiceWriteInput;
  hymns: IHymn[];
}): Promise<{ service: IService; createdCount: number; series?: IRecurrenceSeries }> {
  const timeZone = await timezoneForChurch(input.churchId);

  if (!input.data.recurring) {
    const fields = scheduledFields(
      input.data.date,
      input.data.time,
      input.data.durationMinutes,
      timeZone
    );
    await assertNoOverlap(input.churchId, fields, [], timeZone);
    const service = await Service.create({
      churchId: new Types.ObjectId(input.churchId),
      title: input.data.title,
      ...fields,
      hymns: input.hymns,
      createdBy: input.actor,
    });
    return { service, createdCount: 1 };
  }

  if (input.data.requestId) {
    const existing = await RecurrenceSeries.findOne(
      withChurch(input.churchId, { requestId: input.data.requestId })
    );
    if (existing) {
      const first = await Service.findOne(
        withChurch(input.churchId, { recurrenceSeriesId: existing._id })
      ).sort({ scheduledStartAt: 1, date: 1 });
      if (first) {
        const createdCount = await Service.countDocuments(
          withChurch(input.churchId, { recurrenceSeriesId: existing._id })
        );
        return { service: first, createdCount, series: existing };
      }
    }
  }

  const weekday = input.data.weekday ?? weekdayInZone(input.data.date, timeZone);
  const startDate = alignToWeekday(input.data.date, weekday, timeZone);
  const endDate = input.data.endDate!;
  const frequency = input.data.frequency ?? 'weekly';
  const limitError = previewLimitsError(startDate, endDate, frequency, timeZone);
  if (limitError) {
    throw Object.assign(new Error(limitError), { status: 400 });
  }

  const dates = buildOccurrenceDates({ startDate, endDate, frequency, timeZone });
  if (!dates.length) {
    throw Object.assign(new Error('Nenhuma ocorrência cabe no intervalo informado.'), { status: 400 });
  }

  const windows = dates.map((date) =>
    scheduledFields(date, input.data.time, input.data.durationMinutes, timeZone)
  );
  for (let i = 0; i < windows.length; i += 1) {
    await assertNoOverlap(input.churchId, windows[i]!, [], timeZone);
    const current = operationalWindow(windows[i]!, timeZone);
    if (!current) continue;
    for (let j = i + 1; j < windows.length; j += 1) {
      const other = operationalWindow(windows[j]!, timeZone);
      if (other && current.start.getTime() < other.end.getTime() && other.start.getTime() < current.end.getTime()) {
        throw Object.assign(
          new Error('As ocorrências desta série se sobrepõem. Ajuste o horário ou a duração.'),
          { status: 409 }
        );
      }
    }
  }

  const series = await RecurrenceSeries.create({
    churchId: new Types.ObjectId(input.churchId),
    title: input.data.title,
    frequency,
    weekday,
    startDate,
    endDate,
    time: input.data.time,
    durationMinutes: input.data.durationMinutes,
    activationLeadMinutes: DEFAULT_LEAD_MINUTES,
    active: true,
    requestId: input.data.requestId,
    createdBy: input.actor,
  });

  try {
    const created = await Service.insertMany(
      dates.map((date, index) => ({
        churchId: new Types.ObjectId(input.churchId),
        title: input.data.title,
        recurrenceSeriesId: series._id,
        ...windows[index],
        hymns: [],
        createdBy: input.actor,
      }))
    );
    const first = created[0];
    if (!first) throw new Error('Erro ao criar culto');
    return { service: first as unknown as IService, createdCount: created.length, series };
  } catch (error) {
    await Service.deleteMany(withChurch(input.churchId, { recurrenceSeriesId: series._id }));
    await RecurrenceSeries.deleteOne(withChurch(input.churchId, { _id: series._id }));
    if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
      throw Object.assign(new Error('Esta série já estava sendo criada. Recarregue a lista.'), {
        status: 409,
      });
    }
    throw error;
  }
}

export async function updateOccurrence(input: {
  churchId: string;
  service: IService;
  data: ServiceWriteInput;
  hymns: IHymn[];
  scope: EditScope;
}): Promise<IService> {
  const timeZone = await timezoneForChurch(input.churchId);
  const fields = scheduledFields(
    input.data.date,
    input.data.time,
    input.data.durationMinutes,
    timeZone
  );

  if (!input.service.recurrenceSeriesId || input.scope === 'this') {
    await assertNoOverlap(input.churchId, fields, [input.service._id], timeZone);
    input.service.title = input.data.title;
    input.service.date = fields.date;
    input.service.time = fields.time;
    input.service.durationMinutes = fields.durationMinutes;
    input.service.activationLeadMinutes = fields.activationLeadMinutes;
    input.service.scheduledStartAt = fields.scheduledStartAt ?? undefined;
    input.service.hymns = input.hymns;
    await input.service.save();
    return input.service;
  }

  const series = await RecurrenceSeries.findOne(
    withChurch(input.churchId, { _id: input.service.recurrenceSeriesId })
  );
  if (!series) {
    throw Object.assign(new Error('Série recorrente não encontrada'), { status: 404 });
  }

  const startAt = input.service.scheduledStartAt || fields.scheduledStartAt || input.service.date;
  const future = await Service.find(
    withChurch(input.churchId, {
      recurrenceSeriesId: series._id,
      cancelledAt: { $exists: false },
      closedAt: { $exists: false },
      $or: [
        { scheduledStartAt: { $gte: startAt } },
        { scheduledStartAt: { $exists: false }, date: { $gte: input.service.date } },
      ],
    })
  ).sort({ scheduledStartAt: 1, date: 1 });

  const earlier = await Service.countDocuments(
    withChurch(input.churchId, {
      recurrenceSeriesId: series._id,
      $or: [
        { scheduledStartAt: { $lt: startAt } },
        { scheduledStartAt: { $exists: false }, date: { $lt: input.service.date } },
      ],
    })
  );

  for (const occurrence of future) {
    const next = {
      date: occurrence._id.equals(input.service._id) ? fields.date : occurrence.date,
      time: fields.time,
      durationMinutes: fields.durationMinutes,
      activationLeadMinutes: fields.activationLeadMinutes,
      scheduledStartAt: occurrence._id.equals(input.service._id)
        ? fields.scheduledStartAt
        : combineDateAndTime(occurrence.date, fields.time, timeZone),
    };
    await assertNoOverlap(
      input.churchId,
      next,
      future.map((item) => item._id),
      timeZone
    );
  }

  let targetSeries = series;
  if (earlier > 0) {
    targetSeries = await RecurrenceSeries.create({
      churchId: new Types.ObjectId(input.churchId),
      title: input.data.title,
      frequency: series.frequency,
      weekday: weekdayInZone(fields.date, timeZone),
      startDate: fields.date,
      endDate: series.endDate,
      time: fields.time,
      durationMinutes: fields.durationMinutes,
      activationLeadMinutes: DEFAULT_LEAD_MINUTES,
      active: true,
      createdBy: series.createdBy,
    });
    series.endDate = addMinutes(startAt, -1);
    await series.save();
  } else {
    series.title = input.data.title;
    series.time = fields.time;
    series.durationMinutes = fields.durationMinutes;
    series.startDate = fields.date;
    series.weekday = weekdayInZone(fields.date, timeZone);
    await series.save();
  }

  for (const occurrence of future) {
    const isSelected = occurrence._id.equals(input.service._id);
    occurrence.title = input.data.title;
    occurrence.time = fields.time;
    occurrence.durationMinutes = fields.durationMinutes;
    occurrence.activationLeadMinutes = fields.activationLeadMinutes;
    occurrence.recurrenceSeriesId = targetSeries._id;
    if (isSelected) {
      occurrence.date = fields.date;
      occurrence.scheduledStartAt = fields.scheduledStartAt ?? undefined;
      occurrence.hymns = input.hymns;
    } else {
      occurrence.scheduledStartAt = combineDateAndTime(occurrence.date, fields.time, timeZone) ?? undefined;
    }
    await occurrence.save();
  }

  return future.find((item) => item._id.equals(input.service._id)) ?? input.service;
}

export async function cancelOccurrence(churchId: string, service: IService) {
  if (service.cancelledAt) return service;
  service.cancelledAt = new Date();
  await service.save();
  return service;
}

export async function closeOccurrence(churchId: string, service: IService) {
  if (service.cancelledAt) {
    throw Object.assign(new Error('Este culto já foi cancelado.'), { status: 400 });
  }
  if (service.closedAt) return service;
  const updated = await Service.findOneAndUpdate(
    withChurch(churchId, { _id: service._id, closedAt: { $exists: false } }),
    { $set: { closedAt: new Date() } },
    { new: true }
  );
  return updated ?? service;
}

export async function openOccurrence(churchId: string, service: IService) {
  if (service.cancelledAt) {
    throw Object.assign(new Error('Este culto foi cancelado.'), { status: 400 });
  }
  if (service.closedAt) {
    throw Object.assign(new Error('Este culto já foi encerrado.'), { status: 400 });
  }
  if (!service.openedAt) {
    service.openedAt = new Date();
    await service.save();
  }
  return service;
}

export async function extendOccurrence(
  churchId: string,
  service: IService,
  minutes: number
) {
  if (minutes !== 30 && minutes !== 60) {
    throw Object.assign(new Error('A extensão deve ser de 30 ou 60 minutos.'), { status: 400 });
  }
  if (service.cancelledAt) {
    throw Object.assign(new Error('Este culto foi cancelado.'), { status: 400 });
  }
  if (service.closedAt) {
    throw Object.assign(new Error('Não é possível estender um culto encerrado.'), { status: 400 });
  }
  const timeZone = await timezoneForChurch(churchId);
  const start = service.scheduledStartAt || combineDateAndTime(service.date, service.time || '', timeZone);
  const planned = start
    ? addMinutes(start, service.durationMinutes || DEFAULT_DURATION_MINUTES)
    : addMinutes(new Date(), service.durationMinutes || DEFAULT_DURATION_MINUTES);
  const currentEnd =
    service.extendedUntil && service.extendedUntil.getTime() > planned.getTime()
      ? service.extendedUntil
      : planned;
  const nextEnd = addMinutes(currentEnd, minutes);
  await assertNoOverlap(
    churchId,
    {
      date: service.date,
      time: service.time,
      scheduledStartAt: service.scheduledStartAt,
      durationMinutes: service.durationMinutes,
      activationLeadMinutes: service.activationLeadMinutes,
      extendedUntil: nextEnd,
    },
    [service._id],
    timeZone
  );
  service.extendedUntil = nextEnd;
  await service.save();
  return service;
}

export function parseEditScope(value: unknown): EditScope {
  return value === 'thisAndFuture' ? 'thisAndFuture' : 'this';
}
