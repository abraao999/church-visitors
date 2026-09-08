import mongoose, { Schema, Document, Types } from 'mongoose';
import { REQUEST_ID_UNIQUE_INDEX } from '../utils/requestIdIndex.js';
import { actorSchema, type IActor } from './Actor.js';
import { guestOriginSchema, type IGuestOrigin } from './GuestOrigin.js';

export type PrayerSource = 'owner' | 'guest_access' | 'porteiro' | 'live';

export interface IPrayerRequest extends Document {
  churchId: Types.ObjectId;
  name: string;
  request: string;
  source: PrayerSource;
  isAnonymous: boolean;
  /** Só vai ao telão com autorização explícita de quem enviou. */
  allowProjection: boolean;
  createdBy?: IActor;
  guestAccess?: IGuestOrigin;
  requestId?: string;
  serviceId?: Types.ObjectId;
  createdAt: Date;
}

const prayerRequestSchema = new Schema<IPrayerRequest>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true },
    name: { type: String, default: '', trim: true, maxlength: 120 },
    request: { type: String, required: true, trim: true, maxlength: 2000 },
    source: {
      type: String,
      enum: ['owner', 'guest_access', 'porteiro', 'live'],
      required: true,
    },
    isAnonymous: { type: Boolean, default: false },
    allowProjection: { type: Boolean, default: false },
    createdBy: { type: actorSchema, required: false },
    guestAccess: { type: guestOriginSchema, required: false },
    requestId: { type: String, trim: true, maxlength: 64 },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

prayerRequestSchema.index({ churchId: 1, createdAt: -1 });
prayerRequestSchema.index({ churchId: 1, 'guestAccess.guestAccessId': 1 });
prayerRequestSchema.index({ churchId: 1, allowProjection: 1, createdAt: -1 });
prayerRequestSchema.index({ churchId: 1, requestId: 1 }, REQUEST_ID_UNIQUE_INDEX);
prayerRequestSchema.index({ churchId: 1, serviceId: 1, createdAt: -1 });
prayerRequestSchema.index({ churchId: 1, createdAt: 1 });

export const PrayerRequest = mongoose.model<IPrayerRequest>('PrayerRequest', prayerRequestSchema);
