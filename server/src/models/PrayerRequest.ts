import mongoose, { Schema, Document } from 'mongoose';
import { actorSchema, type IActor } from './Actor.js';

export type PrayerSource = 'porteiro' | 'live';

export interface IPrayerRequest extends Document {
  name: string;
  request: string;
  source: PrayerSource;
  isAnonymous: boolean;
  createdBy?: IActor;
  createdAt: Date;
}

const prayerRequestSchema = new Schema<IPrayerRequest>(
  {
    name: { type: String, default: '', trim: true },
    request: { type: String, required: true, trim: true },
    source: { type: String, enum: ['porteiro', 'live'], required: true },
    isAnonymous: { type: Boolean, default: false },
    createdBy: { type: actorSchema, required: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const PrayerRequest = mongoose.model<IPrayerRequest>('PrayerRequest', prayerRequestSchema);
