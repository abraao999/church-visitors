import mongoose, { Document, Schema, Types } from 'mongoose';

export const PUBLIC_ACCESS_EVENT_TYPES = ['opened', 'form_started', 'submitted'] as const;
export type PublicAccessEventType = (typeof PUBLIC_ACCESS_EVENT_TYPES)[number];

export const PUBLIC_ACCESS_CHANNELS = ['qr', 'shared_link'] as const;
export type PublicAccessChannel = (typeof PUBLIC_ACCESS_CHANNELS)[number];

export interface IPublicAccessEvent extends Document {
  churchId: Types.ObjectId;
  guestAccessId: Types.ObjectId;
  purpose: string;
  type: PublicAccessEventType;
  channel: PublicAccessChannel;
  createdAt: Date;
}

const publicAccessEventSchema = new Schema<IPublicAccessEvent>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true },
    guestAccessId: { type: Schema.Types.ObjectId, ref: 'GuestAccess', required: true },
    purpose: { type: String, required: true, trim: true, maxlength: 40 },
    type: { type: String, enum: PUBLIC_ACCESS_EVENT_TYPES, required: true },
    channel: { type: String, enum: PUBLIC_ACCESS_CHANNELS, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

publicAccessEventSchema.index({ churchId: 1, createdAt: -1 });
publicAccessEventSchema.index({ churchId: 1, guestAccessId: 1, createdAt: -1 });
publicAccessEventSchema.index({ churchId: 1, type: 1, channel: 1, createdAt: -1 });

export const PublicAccessEvent = mongoose.model<IPublicAccessEvent>(
  'PublicAccessEvent',
  publicAccessEventSchema
);
