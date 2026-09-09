import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IReportDailySummary extends Document {
  churchId: Types.ObjectId;
  dateKey: string;
  visitors: number;
  firstVisits: number;
  returningVisits: number;
  unknownVisits: number;
  prayers: number;
  vehicleNotices: number;
  cities: Record<string, number>;
  visitorSources: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

const reportDailySummarySchema = new Schema<IReportDailySummary>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true },
    dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    visitors: { type: Number, default: 0, min: 0 },
    firstVisits: { type: Number, default: 0, min: 0 },
    returningVisits: { type: Number, default: 0, min: 0 },
    unknownVisits: { type: Number, default: 0, min: 0 },
    prayers: { type: Number, default: 0, min: 0 },
    vehicleNotices: { type: Number, default: 0, min: 0 },
    cities: { type: Schema.Types.Mixed, default: {} },
    visitorSources: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

reportDailySummarySchema.index({ churchId: 1, dateKey: 1 }, { unique: true });

export const ReportDailySummary = mongoose.model<IReportDailySummary>(
  'ReportDailySummary',
  reportDailySummarySchema
);
