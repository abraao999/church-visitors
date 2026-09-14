import mongoose, { Document, Schema } from 'mongoose';
import { SYSTEM_JOB_HISTORY_DAYS, systemHistoryExpiry } from './SystemJobRun.js';

export const SYSTEM_HEALTH_SOURCES = ['email', 'retention', 'database', 'storage'] as const;
export const SYSTEM_HEALTH_SEVERITIES = ['warning', 'critical'] as const;

export type SystemHealthSource = (typeof SYSTEM_HEALTH_SOURCES)[number];
export type SystemHealthSeverity = (typeof SYSTEM_HEALTH_SEVERITIES)[number];

export const SYSTEM_HEALTH_SAFE_MESSAGES = {
  email_delivery_failed: 'O provedor recusou temporariamente o envio de e-mail.',
  email_not_configured: 'O envio de e-mail não está configurado no servidor.',
  retention_cron_failed: 'A rotina automática de retenção não pôde ser concluída.',
  retention_partial_failure: 'A retenção automática concluiu com falhas em algumas igrejas.',
  database_unavailable: 'O banco de dados não respondeu à verificação.',
} as const;

export type SystemHealthEventType = keyof typeof SYSTEM_HEALTH_SAFE_MESSAGES;

export interface ISystemHealthEvent extends Document {
  source: SystemHealthSource;
  type: SystemHealthEventType;
  severity: SystemHealthSeverity;
  safeMessage: string;
  createdAt: Date;
  resolvedAt?: Date;
  expiresAt: Date;
}

const systemHealthEventSchema = new Schema<ISystemHealthEvent>(
  {
    source: { type: String, enum: SYSTEM_HEALTH_SOURCES, required: true },
    type: { type: String, required: true, maxlength: 64 },
    severity: { type: String, enum: SYSTEM_HEALTH_SEVERITIES, required: true },
    safeMessage: { type: String, required: true, trim: true, maxlength: 240 },
    resolvedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

systemHealthEventSchema.index({ createdAt: -1 });
systemHealthEventSchema.index({ source: 1, createdAt: -1 });
systemHealthEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SystemHealthEvent = mongoose.model<ISystemHealthEvent>(
  'SystemHealthEvent',
  systemHealthEventSchema
);

export const HEALTH_EVENT_TTL_DAYS = SYSTEM_JOB_HISTORY_DAYS;

export async function recordSystemHealthEvent(input: {
  source: SystemHealthSource;
  type: SystemHealthEventType;
  severity: SystemHealthSeverity;
}): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 1) return;
    await SystemHealthEvent.create({
      source: input.source,
      type: input.type,
      severity: input.severity,
      safeMessage: SYSTEM_HEALTH_SAFE_MESSAGES[input.type],
      expiresAt: systemHistoryExpiry(),
    });
  } catch {
    // Incidentes técnicos não podem impedir o fluxo principal.
  }
}
