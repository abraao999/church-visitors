import mongoose, { Schema, Document, Types } from 'mongoose';
import { actorSchema, type IActor } from './Actor.js';
import {
  INVITABLE_ROLES,
  type InvitableRole,
  type Permission,
} from '../utils/permissions.js';

export const TEAM_INVITE_STATUSES = ['pending', 'accepted', 'cancelled'] as const;
export type TeamInviteStatus = (typeof TEAM_INVITE_STATUSES)[number];

export interface ITeamInvitation extends Document {
  churchId: Types.ObjectId;
  name: string;
  email?: string;
  publicId: string;
  version: number;
  role: InvitableRole;
  permissions: Permission[];
  permissionsCustomized: boolean;
  status: TeamInviteStatus;
  expiresAt: Date;
  createdBy: IActor;
  acceptedBy?: IActor;
  acceptedAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const teamInvitationSchema = new Schema<ITeamInvitation>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 180 },
    publicId: {
      type: String,
      required: true,
      unique: true,
      minlength: 32,
      maxlength: 32,
    },
    version: { type: Number, required: true, default: 1, min: 1 },
    role: { type: String, enum: INVITABLE_ROLES, required: true },
    permissions: { type: [String], default: [] },
    permissionsCustomized: { type: Boolean, default: false },
    status: { type: String, enum: TEAM_INVITE_STATUSES, required: true, default: 'pending' },
    expiresAt: { type: Date, required: true },
    createdBy: { type: actorSchema, required: true },
    acceptedBy: { type: actorSchema, required: false },
    acceptedAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

teamInvitationSchema.index({ churchId: 1, status: 1, createdAt: -1 });
teamInvitationSchema.index({ churchId: 1, expiresAt: 1 });
teamInvitationSchema.index({ churchId: 1, email: 1 }, { sparse: true });

export const TeamInvitation = mongoose.model<ITeamInvitation>(
  'TeamInvitation',
  teamInvitationSchema
);
