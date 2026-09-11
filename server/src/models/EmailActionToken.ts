import mongoose, { Document, Schema, Types } from 'mongoose';

export const EMAIL_ACTION_PURPOSES = ['password_reset'] as const;
export type EmailActionPurpose = (typeof EMAIL_ACTION_PURPOSES)[number];

export interface IEmailActionToken extends Document {
  purpose: EmailActionPurpose;
  userId: Types.ObjectId;
  churchId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
  deleteAfter: Date;
}

const emailActionTokenSchema = new Schema<IEmailActionToken>(
  {
    purpose: { type: String, required: true, enum: EMAIL_ACTION_PURPOSES, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
    deleteAfter: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

emailActionTokenSchema.index({ userId: 1, churchId: 1, purpose: 1, usedAt: 1 });
emailActionTokenSchema.index({ deleteAfter: 1 }, { expireAfterSeconds: 0 });

export const EmailActionToken = mongoose.model<IEmailActionToken>(
  'EmailActionToken',
  emailActionTokenSchema
);
