import mongoose, { Document, Schema } from 'mongoose';

export interface IPublicRateLimit extends Document<string> {
  _id: string;
  count: number;
  expiresAt: Date;
}

const publicRateLimitSchema = new Schema<IPublicRateLimit>(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);

publicRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PublicRateLimit = mongoose.model<IPublicRateLimit>(
  'PublicRateLimit',
  publicRateLimitSchema
);
