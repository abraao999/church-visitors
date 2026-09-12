import mongoose, { Document, Schema, Types } from 'mongoose';
import type { PlatformAdminRole } from './PlatformAdmin.js';

export const PLATFORM_AUDIT_OPERATIONS = [
  'login_succeeded',
  'login_blocked',
  'logout',
  'church_assisted_created',
  'church_suspended',
  'church_reactivated',
  'verification_resent',
  'password_reset_requested',
  'admin_changed',
] as const;

export type PlatformAuditOperation = (typeof PLATFORM_AUDIT_OPERATIONS)[number];

export interface IPlatformAuditEvent extends Document {
  platformAdminId?: Types.ObjectId;
  platformAdminName?: string;
  platformAdminRole?: PlatformAdminRole;
  operation: PlatformAuditOperation;
  targetType?: string;
  targetId?: string;
  churchId?: Types.ObjectId;
  reason?: string;
  metadata?: Record<string, string | number | boolean>;
  createdAt: Date;
}

const platformAuditEventSchema = new Schema<IPlatformAuditEvent>(
  {
    platformAdminId: { type: Schema.Types.ObjectId, ref: 'PlatformAdmin', required: false, index: true },
    platformAdminName: { type: String, trim: true, maxlength: 120 },
    platformAdminRole: { type: String },
    operation: { type: String, required: true, enum: PLATFORM_AUDIT_OPERATIONS, index: true },
    targetType: { type: String, trim: true, maxlength: 40 },
    targetId: { type: String, trim: true, maxlength: 80 },
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: false, index: true },
    reason: { type: String, trim: true, maxlength: 400 },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

platformAuditEventSchema.index({ createdAt: -1 });
platformAuditEventSchema.index({ operation: 1, createdAt: -1 });

export const PlatformAuditEvent = mongoose.model<IPlatformAuditEvent>(
  'PlatformAuditEvent',
  platformAuditEventSchema
);

export async function recordPlatformAudit(input: {
  platformAdminId?: Types.ObjectId;
  platformAdminName?: string;
  platformAdminRole?: PlatformAdminRole;
  operation: PlatformAuditOperation;
  targetType?: string;
  targetId?: string;
  churchId?: Types.ObjectId;
  reason?: string;
  metadata?: Record<string, string | number | boolean>;
}): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 1) return;
    await PlatformAuditEvent.create({
      platformAdminId: input.platformAdminId,
      platformAdminName: input.platformAdminName,
      platformAdminRole: input.platformAdminRole,
      operation: input.operation,
      targetType: input.targetType,
      targetId: input.targetId,
      churchId: input.churchId,
      reason: input.reason,
      metadata: input.metadata,
    });
  } catch {
    // Auditoria não pode impedir o fluxo administrativo.
  }
}
