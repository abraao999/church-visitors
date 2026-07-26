import mongoose, { Schema, Document } from 'mongoose';

export type PrayerSource = 'porteiro' | 'live';

export interface IPrayerRequest extends Document {
  name: string;
  request: string;
  source: PrayerSource;
  isAnonymous: boolean;
  createdAt: Date;
}

const prayerRequestSchema = new Schema<IPrayerRequest>(
  {
    name: { type: String, default: '', trim: true },
    request: { type: String, required: true, trim: true },
    source: { type: String, enum: ['porteiro', 'live'], required: true },
    isAnonymous: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const PrayerRequest = mongoose.model<IPrayerRequest>('PrayerRequest', prayerRequestSchema);
