import mongoose, { Schema, Document, Types } from 'mongoose';
import { actorSchema, type IActor } from './Actor.js';

export interface IHymn {
  title: string;
  artist: string;
  performedBy: string;
  addedBy?: IActor;
}

export interface IService extends Document {
  churchId: Types.ObjectId;
  title: string;
  date: Date;
  time?: string;
  hymns: IHymn[];
  recurrenceSeriesId?: Types.ObjectId;
  scheduledStartAt?: Date;
  durationMinutes?: number;
  activationLeadMinutes?: number;
  cancelledAt?: Date;
  closedAt?: Date;
  extendedUntil?: Date;
  openedAt?: Date;
  autoOpenedAt?: Date;
  createdBy?: IActor;
  createdAt: Date;
  updatedAt: Date;
}

const hymnSchema = new Schema<IHymn>(
  {
    title: { type: String, required: true, trim: true },
    artist: { type: String, required: true, trim: true },
    performedBy: { type: String, required: true, trim: true },
    addedBy: { type: actorSchema, required: false },
  },
  { _id: false }
);

const serviceSchema = new Schema<IService>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true },
    title: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    time: { type: String, trim: true, default: '' },
    hymns: {
      type: [hymnSchema],
      default: [],
    },
    recurrenceSeriesId: { type: Schema.Types.ObjectId, ref: 'RecurrenceSeries' },
    scheduledStartAt: { type: Date },
    durationMinutes: { type: Number, min: 15, max: 720 },
    activationLeadMinutes: { type: Number, min: 0, max: 180 },
    cancelledAt: { type: Date },
    closedAt: { type: Date },
    extendedUntil: { type: Date },
    openedAt: { type: Date },
    autoOpenedAt: { type: Date },
    createdBy: { type: actorSchema, required: false },
  },
  { timestamps: true }
);

serviceSchema.index({ churchId: 1, date: 1 });
serviceSchema.index({ churchId: 1, scheduledStartAt: 1 });
serviceSchema.index(
  { churchId: 1, recurrenceSeriesId: 1, scheduledStartAt: 1 },
  { unique: true, sparse: true }
);

export const Service = mongoose.model<IService>('Service', serviceSchema);
