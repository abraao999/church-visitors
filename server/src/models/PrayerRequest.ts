import mongoose, { Schema, Document, Types } from 'mongoose';
import { actorSchema, type IActor } from './Actor.js';
import { guestOriginSchema, type IGuestOrigin } from './GuestOrigin.js';

export type PrayerSource = 'owner' | 'guest_access' | 'porteiro' | 'live';

export interface IPrayerRequest extends Document {
  /** Transitório: será obrigatório somente depois da migração controlada. */
  churchId?: Types.ObjectId;
  name: string;
  request: string;
  source: PrayerSource;
  isAnonymous: boolean;
  createdBy?: IActor;
  guestAccess?: IGuestOrigin;
  createdAt: Date;
}

const prayerRequestSchema = new Schema<IPrayerRequest>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church' },
    name: { type: String, default: '', trim: true, maxlength: 120 },
    request: { type: String, required: true, trim: true, maxlength: 2000 },
    source: {
      type: String,
      enum: ['owner', 'guest_access', 'porteiro', 'live'],
      required: true,
    },
    isAnonymous: { type: Boolean, default: false },
    createdBy: { type: actorSchema, required: false },
    guestAccess: { type: guestOriginSchema, required: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

prayerRequestSchema.index({ churchId: 1, createdAt: -1 });
prayerRequestSchema.index({ churchId: 1, 'guestAccess.guestAccessId': 1 });

export const PrayerRequest = mongoose.model<IPrayerRequest>('PrayerRequest', prayerRequestSchema);
