import mongoose, { Document, Schema, Types } from 'mongoose';

export interface RetentionSummary {
  visitorsAnonymized: number;
  prayersDeleted: number;
  vehicleNoticesDeleted: number;
  guestAccessesDeleted: number;
  teamInvitationsDeleted: number;
  portariaDevicesDeleted: number;
}

export interface IRetentionRun extends Document {
  churchId: Types.ObjectId;
  trigger: 'automatic' | 'owner';
  status: 'completed' | 'failed';
  summary: RetentionSummary;
  startedAt: Date;
  completedAt: Date;
  expiresAt: Date;
}

const summarySchema = new Schema<RetentionSummary>(
  {
    visitorsAnonymized: { type: Number, required: true, default: 0 },
    prayersDeleted: { type: Number, required: true, default: 0 },
    vehicleNoticesDeleted: { type: Number, required: true, default: 0 },
    guestAccessesDeleted: { type: Number, required: true, default: 0 },
    teamInvitationsDeleted: { type: Number, required: true, default: 0 },
    portariaDevicesDeleted: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const retentionRunSchema = new Schema<IRetentionRun>({
  churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true },
  trigger: { type: String, enum: ['automatic', 'owner'], required: true },
  status: { type: String, enum: ['completed', 'failed'], required: true },
  summary: { type: summarySchema, required: true },
  startedAt: { type: Date, required: true },
  completedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});

retentionRunSchema.index({ churchId: 1, startedAt: -1 });
retentionRunSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RetentionRun = mongoose.model<IRetentionRun>('RetentionRun', retentionRunSchema);
