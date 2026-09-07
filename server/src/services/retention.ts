import { Types } from 'mongoose';
import { GuestAccess } from '../models/GuestAccess.js';
import { PortariaDevice } from '../models/PortariaDevice.js';
import { PrayerRequest } from '../models/PrayerRequest.js';
import {
  RETENTION_DEFAULTS,
  RetentionPolicy,
  type IRetentionPolicy,
  type RetentionPeriods,
} from '../models/RetentionPolicy.js';
import { RetentionRun, type RetentionSummary } from '../models/RetentionRun.js';
import { TeamInvitation } from '../models/TeamInvitation.js';
import { VehicleNotice } from '../models/VehicleNotice.js';
import { Visitor } from '../models/Visitor.js';
import { withChurch } from '../utils/tenant.js';

export type RetentionPolicyValues = RetentionPeriods & { enabled: boolean };

const RUN_HISTORY_DAYS = 730;
const STALE_LOCK_MINUTES = 30;
const MAX_CHURCHES_PER_AUTOMATIC_RUN = 50;

export const RETENTION_LIMITS = {
  visitorsMonths: { min: 1, max: 120 },
  prayersDays: { min: 7, max: 730 },
  vehicleNoticesDays: { min: 7, max: 365 },
  guestAccessesDays: { min: 7, max: 730 },
  teamInvitationsDays: { min: 7, max: 730 },
  portariaDevicesDays: { min: 30, max: 1825 },
} as const;

export function defaultRetentionPolicy(): RetentionPolicyValues {
  return { enabled: false, ...RETENTION_DEFAULTS };
}

function validInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export function parseRetentionPolicy(
  input: unknown
): { data?: RetentionPolicyValues; error?: string } {
  if (!input || typeof input !== 'object') {
    return { error: 'Revise os prazos da política de retenção.' };
  }

  const body = input as Record<string, unknown>;
  const defaults = defaultRetentionPolicy();
  const data: RetentionPolicyValues = {
    enabled: body.enabled === true,
    visitorsMonths: body.visitorsMonths as number,
    prayersDays: body.prayersDays as number,
    vehicleNoticesDays: body.vehicleNoticesDays as number,
    guestAccessesDays: body.guestAccessesDays as number,
    teamInvitationsDays: body.teamInvitationsDays as number,
    portariaDevicesDays: body.portariaDevicesDays as number,
  };

  for (const key of Object.keys(RETENTION_LIMITS) as Array<keyof RetentionPeriods>) {
    const limits = RETENTION_LIMITS[key];
    if (!validInteger(data[key], limits.min, limits.max)) {
      return {
        error: `O prazo de ${key} deve ser um número inteiro entre ${limits.min} e ${limits.max}.`,
      };
    }
  }

  return { data: { ...defaults, ...data } };
}

export function subtractDays(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function subtractMonths(now: Date, months: number): Date {
  const result = new Date(now);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

export function policyValues(policy?: Partial<IRetentionPolicy> | null): RetentionPolicyValues {
  return {
    enabled: policy?.enabled === true,
    visitorsMonths: policy?.visitorsMonths ?? RETENTION_DEFAULTS.visitorsMonths,
    prayersDays: policy?.prayersDays ?? RETENTION_DEFAULTS.prayersDays,
    vehicleNoticesDays:
      policy?.vehicleNoticesDays ?? RETENTION_DEFAULTS.vehicleNoticesDays,
    guestAccessesDays: policy?.guestAccessesDays ?? RETENTION_DEFAULTS.guestAccessesDays,
    teamInvitationsDays:
      policy?.teamInvitationsDays ?? RETENTION_DEFAULTS.teamInvitationsDays,
    portariaDevicesDays:
      policy?.portariaDevicesDays ?? RETENTION_DEFAULTS.portariaDevicesDays,
  };
}

export function buildRetentionFilters(
  churchId: string,
  policy: RetentionPolicyValues,
  now = new Date()
) {
  const visitorCutoff = subtractMonths(now, policy.visitorsMonths);
  const prayerCutoff = subtractDays(now, policy.prayersDays);
  const vehicleCutoff = subtractDays(now, policy.vehicleNoticesDays);
  const guestAccessCutoff = subtractDays(now, policy.guestAccessesDays);
  const invitationCutoff = subtractDays(now, policy.teamInvitationsDays);
  const deviceCutoff = subtractDays(now, policy.portariaDevicesDays);

  return {
    cutoffs: {
      visitors: visitorCutoff,
      prayers: prayerCutoff,
      vehicleNotices: vehicleCutoff,
      guestAccesses: guestAccessCutoff,
      teamInvitations: invitationCutoff,
      portariaDevices: deviceCutoff,
    },
    visitors: withChurch(churchId, {
      visitDate: { $lte: visitorCutoff },
      anonymizedAt: { $exists: false },
    }),
    prayers: withChurch(churchId, { createdAt: { $lte: prayerCutoff } }),
    vehicleNotices: withChurch(churchId, {
      $or: [
        { status: 'resolved', resolvedAt: { $lte: vehicleCutoff } },
        { archived: true, updatedAt: { $lte: vehicleCutoff } },
      ],
    }),
    guestAccesses: withChurch(churchId, {
      $or: [
        { active: false, updatedAt: { $lte: guestAccessCutoff } },
        { expiresAt: { $lte: guestAccessCutoff } },
      ],
    }),
    teamInvitations: withChurch(churchId, {
      $or: [
        { status: { $in: ['accepted', 'cancelled'] }, updatedAt: { $lte: invitationCutoff } },
        { expiresAt: { $lte: invitationCutoff } },
      ],
    }),
    portariaDevices: withChurch(churchId, {
      active: false,
      revokedAt: { $lte: deviceCutoff },
    }),
  };
}

export async function previewRetention(
  churchId: string,
  policy: RetentionPolicyValues,
  now = new Date()
) {
  const filters = buildRetentionFilters(churchId, policy, now);
  const [
    visitorsAnonymized,
    prayersDeleted,
    vehicleNoticesDeleted,
    guestAccessesDeleted,
    teamInvitationsDeleted,
    portariaDevicesDeleted,
  ] = await Promise.all([
    Visitor.countDocuments(filters.visitors),
    PrayerRequest.countDocuments(filters.prayers),
    VehicleNotice.countDocuments(filters.vehicleNotices),
    GuestAccess.countDocuments(filters.guestAccesses),
    TeamInvitation.countDocuments(filters.teamInvitations),
    PortariaDevice.countDocuments(filters.portariaDevices),
  ]);

  return {
    generatedAt: now,
    cutoffs: filters.cutoffs,
    counts: {
      visitorsAnonymized,
      prayersDeleted,
      vehicleNoticesDeleted,
      guestAccessesDeleted,
      teamInvitationsDeleted,
      portariaDevicesDeleted,
    } satisfies RetentionSummary,
  };
}

function emptySummary(): RetentionSummary {
  return {
    visitorsAnonymized: 0,
    prayersDeleted: 0,
    vehicleNoticesDeleted: 0,
    guestAccessesDeleted: 0,
    teamInvitationsDeleted: 0,
    portariaDevicesDeleted: 0,
  };
}

function historyExpiry(startedAt: Date): Date {
  return subtractDays(startedAt, -RUN_HISTORY_DAYS);
}

export async function runRetentionPolicy(
  policyId: string | Types.ObjectId,
  trigger: 'automatic' | 'owner',
  now = new Date()
): Promise<RetentionSummary | null> {
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MINUTES * 60 * 1000);
  const policy = await RetentionPolicy.findOneAndUpdate(
    {
      _id: policyId,
      enabled: true,
      $or: [
        { runningSince: { $exists: false } },
        { runningSince: { $lte: staleBefore } },
      ],
    },
    { $set: { runningSince: now } },
    { new: true }
  );

  if (!policy) return null;

  const churchId = String(policy.churchId);
  const filters = buildRetentionFilters(churchId, policyValues(policy), now);
  const summary = emptySummary();

  try {
    const visitors = await Visitor.updateMany(filters.visitors, {
      $set: {
        name: 'VISITANTE ANONIMIZADO',
        city: 'NÃO INFORMADA',
        relationship: 'outro',
        anonymizedAt: now,
      },
      $unset: {
        createdBy: 1,
        guestAccess: 1,
        portariaDevice: 1,
        requestId: 1,
        capturedAt: 1,
      },
    });
    summary.visitorsAnonymized = visitors.modifiedCount;

    summary.prayersDeleted = (await PrayerRequest.deleteMany(filters.prayers)).deletedCount;
    summary.vehicleNoticesDeleted = (
      await VehicleNotice.deleteMany(filters.vehicleNotices)
    ).deletedCount;
    summary.guestAccessesDeleted = (
      await GuestAccess.deleteMany(filters.guestAccesses)
    ).deletedCount;
    summary.teamInvitationsDeleted = (
      await TeamInvitation.deleteMany(filters.teamInvitations)
    ).deletedCount;
    summary.portariaDevicesDeleted = (
      await PortariaDevice.deleteMany(filters.portariaDevices)
    ).deletedCount;

    await Promise.all([
      RetentionRun.create({
        churchId: policy.churchId,
        trigger,
        status: 'completed',
        summary,
        startedAt: now,
        completedAt: new Date(),
        expiresAt: historyExpiry(now),
      }),
      RetentionPolicy.updateOne(
        { _id: policy._id, churchId: policy.churchId },
        {
          $set: { lastRunAt: now, lastRunStatus: 'completed' },
          $unset: { runningSince: 1 },
        }
      ),
    ]);
    return summary;
  } catch (error) {
    await Promise.allSettled([
      RetentionRun.create({
        churchId: policy.churchId,
        trigger,
        status: 'failed',
        summary,
        startedAt: now,
        completedAt: new Date(),
        expiresAt: historyExpiry(now),
      }),
      RetentionPolicy.updateOne(
        { _id: policy._id, churchId: policy.churchId },
        {
          $set: { lastRunAt: now, lastRunStatus: 'failed' },
          $unset: { runningSince: 1 },
        }
      ),
    ]);
    throw error;
  }
}

export async function runAutomaticRetention() {
  const policies = await RetentionPolicy.find({ enabled: true })
    .select('_id')
    .sort({ lastRunAt: 1, createdAt: 1 })
    .limit(MAX_CHURCHES_PER_AUTOMATIC_RUN);

  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (const policy of policies) {
    try {
      const result = await runRetentionPolicy(policy._id as Types.ObjectId, 'automatic');
      if (result) completed += 1;
      else skipped += 1;
    } catch {
      failed += 1;
    }
  }

  return { selected: policies.length, completed, failed, skipped };
}
