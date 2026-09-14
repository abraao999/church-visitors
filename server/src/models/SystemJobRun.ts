import mongoose, { Document, Schema } from 'mongoose';

export const SYSTEM_JOBS = ['retention'] as const;
export const SYSTEM_JOB_TRIGGERS = ['cron', 'manual'] as const;
export const SYSTEM_JOB_STATUSES = ['running', 'completed', 'failed'] as const;

export type SystemJobName = (typeof SYSTEM_JOBS)[number];
export type SystemJobTrigger = (typeof SYSTEM_JOB_TRIGGERS)[number];
export type SystemJobStatus = (typeof SYSTEM_JOB_STATUSES)[number];

export interface SystemJobSummary {
  policiesFound: number;
  churchesProcessed: number;
  churchesSkipped: number;
  failures: number;
  visitorsAnonymized?: number;
  prayersDeleted?: number;
  vehicleNoticesDeleted?: number;
  guestAccessesDeleted?: number;
  teamInvitationsDeleted?: number;
  portariaDevicesDeleted?: number;
}

export interface ISystemJobRun extends Document {
  job: SystemJobName;
  trigger: SystemJobTrigger;
  status: SystemJobStatus;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  summary?: SystemJobSummary;
  errorCode?: string;
  expiresAt: Date;
}

export const SYSTEM_JOB_HISTORY_DAYS = 90;

export function systemHistoryExpiry(from = new Date()): Date {
  return new Date(from.getTime() + SYSTEM_JOB_HISTORY_DAYS * 24 * 60 * 60 * 1000);
}

const summarySchema = new Schema<SystemJobSummary>(
  {
    policiesFound: { type: Number, required: true, default: 0 },
    churchesProcessed: { type: Number, required: true, default: 0 },
    churchesSkipped: { type: Number, required: true, default: 0 },
    failures: { type: Number, required: true, default: 0 },
    visitorsAnonymized: { type: Number },
    prayersDeleted: { type: Number },
    vehicleNoticesDeleted: { type: Number },
    guestAccessesDeleted: { type: Number },
    teamInvitationsDeleted: { type: Number },
    portariaDevicesDeleted: { type: Number },
  },
  { _id: false }
);

const systemJobRunSchema = new Schema<ISystemJobRun>({
  job: { type: String, enum: SYSTEM_JOBS, required: true },
  trigger: { type: String, enum: SYSTEM_JOB_TRIGGERS, required: true },
  status: { type: String, enum: SYSTEM_JOB_STATUSES, required: true },
  startedAt: { type: Date, required: true },
  completedAt: { type: Date },
  durationMs: { type: Number },
  summary: { type: summarySchema },
  errorCode: { type: String, trim: true, maxlength: 64 },
  expiresAt: { type: Date, required: true },
});

systemJobRunSchema.index({ job: 1, startedAt: -1 });
systemJobRunSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SystemJobRun = mongoose.model<ISystemJobRun>('SystemJobRun', systemJobRunSchema);

export async function startSystemJobRun(
  job: SystemJobName,
  trigger: SystemJobTrigger,
  startedAt = new Date()
): Promise<string | null> {
  try {
    if (mongoose.connection.readyState !== 1) return null;
    const created = await SystemJobRun.create({
      job,
      trigger,
      status: 'running',
      startedAt,
      expiresAt: systemHistoryExpiry(startedAt),
    });
    return String(created._id);
  } catch {
    return null;
  }
}

export async function finishSystemJobRun(
  id: string | null,
  input: {
    status: Exclude<SystemJobStatus, 'running'>;
    summary?: SystemJobSummary;
    errorCode?: string;
    completedAt?: Date;
  }
): Promise<void> {
  if (!id) return;
  try {
    if (mongoose.connection.readyState !== 1) return;
    const completedAt = input.completedAt || new Date();
    const current = await SystemJobRun.findById(id).select('startedAt');
    const durationMs = current ? Math.max(0, completedAt.getTime() - current.startedAt.getTime()) : 0;
    await SystemJobRun.updateOne(
      { _id: id },
      {
        $set: {
          status: input.status,
          completedAt,
          durationMs,
          ...(input.summary ? { summary: input.summary } : {}),
          ...(input.errorCode ? { errorCode: input.errorCode.slice(0, 64) } : {}),
        },
      }
    );
  } catch {
    // O histórico técnico não pode impedir a rotina.
  }
}
