import mongoose, { Document, Schema, Types } from 'mongoose';

export const RETENTION_DEFAULTS = {
  visitorsMonths: 24,
  prayersDays: 90,
  vehicleNoticesDays: 30,
  guestAccessesDays: 90,
  teamInvitationsDays: 90,
  portariaDevicesDays: 180,
} as const;

export interface RetentionPeriods {
  visitorsMonths: number;
  prayersDays: number;
  vehicleNoticesDays: number;
  guestAccessesDays: number;
  teamInvitationsDays: number;
  portariaDevicesDays: number;
}

export interface IRetentionPolicy extends Document, RetentionPeriods {
  churchId: Types.ObjectId;
  enabled: boolean;
  activatedAt?: Date;
  lastRunAt?: Date;
  lastRunStatus?: 'completed' | 'failed';
  runningSince?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const retentionPolicySchema = new Schema<IRetentionPolicy>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true, unique: true },
    enabled: { type: Boolean, required: true, default: false },
    visitorsMonths: { type: Number, min: 1, max: 120, default: RETENTION_DEFAULTS.visitorsMonths },
    prayersDays: { type: Number, min: 7, max: 730, default: RETENTION_DEFAULTS.prayersDays },
    vehicleNoticesDays: { type: Number, min: 7, max: 365, default: RETENTION_DEFAULTS.vehicleNoticesDays },
    guestAccessesDays: { type: Number, min: 7, max: 730, default: RETENTION_DEFAULTS.guestAccessesDays },
    teamInvitationsDays: { type: Number, min: 7, max: 730, default: RETENTION_DEFAULTS.teamInvitationsDays },
    portariaDevicesDays: { type: Number, min: 30, max: 1825, default: RETENTION_DEFAULTS.portariaDevicesDays },
    activatedAt: { type: Date },
    lastRunAt: { type: Date },
    lastRunStatus: { type: String, enum: ['completed', 'failed'] },
    runningSince: { type: Date },
  },
  { timestamps: true }
);

retentionPolicySchema.index({ enabled: 1, lastRunAt: 1 });

export const RetentionPolicy = mongoose.model<IRetentionPolicy>(
  'RetentionPolicy',
  retentionPolicySchema
);
