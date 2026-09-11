import mongoose, { Document, Schema, Types } from 'mongoose';

export const AUTH_AUDIT_ACTIONS = [
  'password_reset_requested',
  'email_confirmed',
  'email_code_locked',
  'password_reset_completed',
  'tokens_invalidated',
] as const;

export type AuthAuditAction = (typeof AUTH_AUDIT_ACTIONS)[number];

export interface IAuthAuditEvent extends Document {
  action: AuthAuditAction;
  churchId?: Types.ObjectId;
  userId?: Types.ObjectId;
  createdAt: Date;
  deleteAfter: Date;
}

const authAuditEventSchema = new Schema<IAuthAuditEvent>(
  {
    action: { type: String, required: true, enum: AUTH_AUDIT_ACTIONS, index: true },
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: false, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    deleteAfter: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

authAuditEventSchema.index({ deleteAfter: 1 }, { expireAfterSeconds: 0 });

export const AuthAuditEvent = mongoose.model<IAuthAuditEvent>('AuthAuditEvent', authAuditEventSchema);

export async function recordAuthAudit(
  action: AuthAuditAction,
  refs?: { churchId?: Types.ObjectId; userId?: Types.ObjectId }
): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 1) return;
    await AuthAuditEvent.create({
      action,
      churchId: refs?.churchId,
      userId: refs?.userId,
      deleteAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    });
  } catch {
    // Auditoria não pode impedir o fluxo de autenticação.
  }
}
