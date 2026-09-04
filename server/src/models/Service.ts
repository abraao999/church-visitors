import mongoose, { Schema, Document, Types } from 'mongoose';
import { actorSchema, type IActor } from './Actor.js';

export interface IHymn {
  title: string;
  artist: string;
  performedBy: string;
  addedBy?: IActor;
}

export interface IService extends Document {
  /** Transitório: será obrigatório somente depois da migração controlada. */
  churchId?: Types.ObjectId;
  title: string;
  date: Date;
  time?: string;
  hymns: IHymn[];
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
    churchId: { type: Schema.Types.ObjectId, ref: 'Church' },
    title: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    time: { type: String, trim: true, default: '' },
    hymns: {
      type: [hymnSchema],
      default: [],
    },
    createdBy: { type: actorSchema, required: false },
  },
  { timestamps: true }
);

serviceSchema.index({ churchId: 1, date: 1 });

export const Service = mongoose.model<IService>('Service', serviceSchema);
