import mongoose, { Schema, Document, Types } from 'mongoose';
import { REQUEST_ID_UNIQUE_INDEX } from '../utils/requestIdIndex.js';
import { actorSchema, type IActor } from './Actor.js';

export const RECURRENCE_FREQUENCIES = ['weekly', 'biweekly'] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export interface IRecurrenceSeries extends Document {
  churchId: Types.ObjectId;
  title: string;
  frequency: RecurrenceFrequency;
  weekday: number;
  startDate: Date;
  endDate: Date;
  time: string;
  durationMinutes: number;
  activationLeadMinutes: number;
  active: boolean;
  requestId?: string;
  createdBy?: IActor;
  createdAt: Date;
  updatedAt: Date;
}

const recurrenceSeriesSchema = new Schema<IRecurrenceSeries>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    frequency: { type: String, enum: RECURRENCE_FREQUENCIES, required: true },
    weekday: { type: Number, required: true, min: 0, max: 6 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    time: { type: String, required: true, trim: true },
    durationMinutes: { type: Number, required: true, min: 15, max: 720 },
    activationLeadMinutes: { type: Number, required: true, default: 30, min: 0, max: 180 },
    active: { type: Boolean, default: true, index: true },
    requestId: { type: String, trim: true, maxlength: 64 },
    createdBy: { type: actorSchema, required: false },
  },
  { timestamps: true }
);

recurrenceSeriesSchema.index({ churchId: 1, active: 1, startDate: 1 });
recurrenceSeriesSchema.index({ churchId: 1, requestId: 1 }, REQUEST_ID_UNIQUE_INDEX);

export const RecurrenceSeries = mongoose.model<IRecurrenceSeries>(
  'RecurrenceSeries',
  recurrenceSeriesSchema
);
