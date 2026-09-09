import mongoose, { Document, Schema, Types } from 'mongoose';
import { actorSchema, type IActor } from './Actor.js';

export interface IReportExportAudit extends Document {
  churchId: Types.ObjectId;
  format: string;
  section: string;
  periodFrom?: string;
  periodTo?: string;
  createdBy?: IActor;
  createdAt: Date;
}

const reportExportAuditSchema = new Schema<IReportExportAudit>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true },
    format: { type: String, required: true, trim: true, maxlength: 40 },
    section: { type: String, required: true, trim: true, maxlength: 40 },
    periodFrom: { type: String, trim: true, maxlength: 10 },
    periodTo: { type: String, trim: true, maxlength: 10 },
    createdBy: { type: actorSchema, required: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

reportExportAuditSchema.index({ churchId: 1, createdAt: -1 });

export const ReportExportAudit = mongoose.model<IReportExportAudit>(
  'ReportExportAudit',
  reportExportAuditSchema
);
