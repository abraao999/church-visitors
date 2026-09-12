import mongoose, { Document, Schema } from 'mongoose';

export const PLATFORM_ADMIN_ROLES = ['platform_owner', 'support', 'viewer'] as const;
export type PlatformAdminRole = (typeof PLATFORM_ADMIN_ROLES)[number];

export interface IPlatformAdmin extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: PlatformAdminRole;
  active: boolean;
  emailVerifiedAt?: Date;
  lastSeenAt?: Date;
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const platformAdminSchema = new Schema<IPlatformAdmin>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: PLATFORM_ADMIN_ROLES, required: true, index: true },
    active: { type: Boolean, default: true, index: true },
    emailVerifiedAt: { type: Date },
    lastSeenAt: { type: Date },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

platformAdminSchema.index({ lastSeenAt: -1 });

export const PlatformAdmin = mongoose.model<IPlatformAdmin>('PlatformAdmin', platformAdminSchema);
