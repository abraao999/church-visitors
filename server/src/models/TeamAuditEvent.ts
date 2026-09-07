import mongoose, { Schema, Document, Types } from 'mongoose';
import { actorSchema, type IActor } from './Actor.js';

export const TEAM_AUDIT_ACTIONS = [
  'invite_created',
  'invite_renewed',
  'invite_cancelled',
  'invite_accepted',
  'role_changed',
  'permissions_changed',
  'account_deactivated',
  'account_reactivated',
  'sessions_revoked',
] as const;

export type TeamAuditAction = (typeof TEAM_AUDIT_ACTIONS)[number];

export interface ITeamAuditEvent extends Document {
  churchId: Types.ObjectId;
  action: TeamAuditAction;
  actor?: IActor;
  targetUserId?: Types.ObjectId;
  targetInvitationId?: Types.ObjectId;
  createdAt: Date;
}

const teamAuditEventSchema = new Schema<ITeamAuditEvent>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true },
    action: { type: String, enum: TEAM_AUDIT_ACTIONS, required: true },
    actor: { type: actorSchema, required: false },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    targetInvitationId: { type: Schema.Types.ObjectId, ref: 'TeamInvitation' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

teamAuditEventSchema.index({ churchId: 1, createdAt: -1 });

export const TeamAuditEvent = mongoose.model<ITeamAuditEvent>(
  'TeamAuditEvent',
  teamAuditEventSchema
);
