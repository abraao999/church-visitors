import mongoose, { Document, Schema } from 'mongoose';

export interface IPendingOwnerRegistration extends Document {
  challengeId: string;
  churchName: string;
  name: string;
  email: string;
  username: string;
  passwordHash: string;
  verificationTokenHash: string;
  verificationCodeHash: string;
  verificationExpiresAt: Date;
  resendAvailableAt: Date;
  attemptCount: number;
  consumedAt?: Date;
  createdAt: Date;
  deleteAfter: Date;
}

const pendingOwnerRegistrationSchema = new Schema<IPendingOwnerRegistration>(
  {
    challengeId: { type: String, required: true, unique: true, index: true },
    churchName: { type: String, required: true, trim: true, maxlength: 120 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    username: { type: String, required: true, trim: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true },
    verificationTokenHash: { type: String, required: true, unique: true },
    verificationCodeHash: { type: String, required: true },
    verificationExpiresAt: { type: Date, required: true },
    resendAvailableAt: { type: Date, required: true },
    attemptCount: { type: Number, required: true, default: 0 },
    consumedAt: { type: Date },
    deleteAfter: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

pendingOwnerRegistrationSchema.index({ deleteAfter: 1 }, { expireAfterSeconds: 0 });

export const PendingOwnerRegistration = mongoose.model<IPendingOwnerRegistration>(
  'PendingOwnerRegistration',
  pendingOwnerRegistrationSchema
);
