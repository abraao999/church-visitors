import mongoose, { Schema, Document, Types } from 'mongoose';
import { actorSchema, type IActor } from './Actor.js';
import { TEAM_ROLES, type Permission, type TeamRole } from '../utils/permissions.js';

export type UserRole = TeamRole;

export interface IUser extends Document {
  name: string;
  email: string;
  username?: string;
  passwordHash?: string;
  churchId: Types.ObjectId;
  role: TeamRole;
  permissions: Permission[];
  permissionsCustomized: boolean;
  active: boolean;
  lastSeenAt?: Date;
  deactivatedAt?: Date;
  deactivatedBy?: IActor;
  permissionsUpdatedAt?: Date;
  permissionsUpdatedBy?: IActor;
  tokenVersion: number;
  emailVerifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    username: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
    passwordHash: { type: String },
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
    role: { type: String, enum: TEAM_ROLES, default: 'owner', required: true, index: true },
    permissions: { type: [String], default: undefined },
    permissionsCustomized: { type: Boolean, default: false },
    active: { type: Boolean, default: true, index: true },
    lastSeenAt: { type: Date },
    deactivatedAt: { type: Date },
    deactivatedBy: { type: actorSchema, required: false },
    permissionsUpdatedAt: { type: Date },
    permissionsUpdatedBy: { type: actorSchema, required: false },
    tokenVersion: { type: Number, default: 0 },
    emailVerifiedAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ churchId: 1, active: 1, createdAt: -1 });
userSchema.index({ churchId: 1, role: 1 });

export const User = mongoose.model<IUser>('User', userSchema);
