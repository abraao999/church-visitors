import { Schema, Types } from 'mongoose';
import { GUEST_ACCESS_TYPES, type GuestAccessType } from './GuestAccess.js';

export interface IGuestOrigin {
  guestAccessId: Types.ObjectId;
  name: string;
  type: GuestAccessType;
}

export const guestOriginSchema = new Schema<IGuestOrigin>(
  {
    guestAccessId: { type: Schema.Types.ObjectId, ref: 'GuestAccess', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: GUEST_ACCESS_TYPES, required: true },
  },
  { _id: false }
);
