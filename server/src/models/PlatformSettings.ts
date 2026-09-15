import mongoose, { Document, Schema, Types } from 'mongoose';
import { RETENTION_DEFAULTS } from './RetentionPolicy.js';

export const PLATFORM_SETTINGS_KEY = 'global' as const;
export const PLATFORM_SENDER_NAME_MAX = 80;
export const PLATFORM_SENDER_ADDRESS_MAX = 254;
export const PLATFORM_MAINTENANCE_MESSAGE_MAX = 180;
export const PLATFORM_MAINTENANCE_MESSAGE_MIN = 10;
export const PLATFORM_CLOSED_MESSAGE_MAX = PLATFORM_MAINTENANCE_MESSAGE_MAX;
export const PLATFORM_CLOSED_MESSAGE_MIN = PLATFORM_MAINTENANCE_MESSAGE_MIN;
export const PLATFORM_MAINTENANCE_WINDOW_MAX = 5;
export const PLATFORM_MAINTENANCE_WINDOW_MAX_MS = 72 * 60 * 60 * 1000;
export const PLATFORM_LIMIT_CHURCHES_MIN = 1;
export const PLATFORM_LIMIT_CHURCHES_MAX = 10_000;
export const PLATFORM_LIMIT_PENDING_MIN = 1;
export const PLATFORM_LIMIT_PENDING_MAX = 500;
export const PLATFORM_TTL_VERIFICATION_MIN = 5;
export const PLATFORM_TTL_VERIFICATION_MAX = 120;
export const PLATFORM_TTL_RESET_MIN = 5;
export const PLATFORM_TTL_RESET_MAX = 120;
export const PLATFORM_TTL_RESEND_MIN = 30;
export const PLATFORM_TTL_RESEND_MAX = 300;
export const PLATFORM_LEGAL_URL_MAX = 500;
export const PLATFORM_NOTICE_MESSAGE_MIN = PLATFORM_MAINTENANCE_MESSAGE_MIN;
export const PLATFORM_NOTICE_MESSAGE_MAX = PLATFORM_MAINTENANCE_MESSAGE_MAX;

export type PlatformNoticeTone = 'info' | 'warning';

export type PlatformApprovalMode = 'automatic' | 'manual';

export interface PlatformRetentionDefaults {
  enabled: boolean;
  visitorsMonths: number;
  prayersDays: number;
  vehicleNoticesDays: number;
  guestAccessesDays: number;
  teamInvitationsDays: number;
  portariaDevicesDays: number;
}

export interface IMaintenanceWindow {
  _id: Types.ObjectId;
  startsAt: Date;
  endsAt: Date;
  message: string;
}

export interface IPlatformSettings extends Document {
  key: typeof PLATFORM_SETTINGS_KEY;
  registrations: {
    enabled: boolean;
    approvalMode: PlatformApprovalMode;
    closedMessage: string;
  };
  email: {
    senderName: string;
    senderAddress: string;
    replyTo?: string;
    ttl: {
      verificationMinutes: number;
      resetMinutes: number;
      resendSeconds: number;
    };
  };
  newChurchDefaults: {
    timezone: string;
    visitorFollowUpEnabled: boolean;
    modules: {
      visitorFollowUpEnabled: boolean;
    };
    retention: PlatformRetentionDefaults;
  };
  maintenance: {
    enabled: boolean;
    message: string;
    windows: Types.DocumentArray<IMaintenanceWindow>;
  };
  limits: {
    maxChurches: number | null;
    maxPendingApprovals: number | null;
  };
  legal: {
    termsUrl: string;
    privacyUrl: string;
  };
  notice: {
    enabled: boolean;
    message: string;
    tone: PlatformNoticeTone;
  };
  createdAt: Date;
  updatedAt: Date;
}

const retentionDefaultsSchema = new Schema<PlatformRetentionDefaults>(
  {
    enabled: { type: Boolean, default: false },
    visitorsMonths: { type: Number, min: 1, max: 120, default: RETENTION_DEFAULTS.visitorsMonths },
    prayersDays: { type: Number, min: 7, max: 730, default: RETENTION_DEFAULTS.prayersDays },
    vehicleNoticesDays: { type: Number, min: 7, max: 365, default: RETENTION_DEFAULTS.vehicleNoticesDays },
    guestAccessesDays: { type: Number, min: 7, max: 730, default: RETENTION_DEFAULTS.guestAccessesDays },
    teamInvitationsDays: { type: Number, min: 7, max: 730, default: RETENTION_DEFAULTS.teamInvitationsDays },
    portariaDevicesDays: { type: Number, min: 30, max: 1825, default: RETENTION_DEFAULTS.portariaDevicesDays },
  },
  { _id: false }
);

const maintenanceWindowSchema = new Schema<IMaintenanceWindow>(
  {
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    message: { type: String, trim: true, maxlength: PLATFORM_MAINTENANCE_MESSAGE_MAX, default: '' },
  },
  { _id: true }
);

const platformSettingsSchema = new Schema<IPlatformSettings>(
  {
    key: { type: String, required: true, enum: [PLATFORM_SETTINGS_KEY], default: PLATFORM_SETTINGS_KEY },
    registrations: {
      enabled: { type: Boolean, default: true },
      approvalMode: { type: String, enum: ['automatic', 'manual'], default: 'automatic' },
      closedMessage: { type: String, trim: true, maxlength: PLATFORM_CLOSED_MESSAGE_MAX, default: '' },
    },
    email: {
      senderName: { type: String, trim: true, minlength: 2, maxlength: PLATFORM_SENDER_NAME_MAX, default: 'Eclesiafy' },
      senderAddress: {
        type: String,
        trim: true,
        maxlength: PLATFORM_SENDER_ADDRESS_MAX,
        default: 'acesso@notificacoes.eclesiafy.com.br',
      },
      replyTo: { type: String, trim: true, maxlength: PLATFORM_SENDER_ADDRESS_MAX, default: '' },
      ttl: {
        verificationMinutes: {
          type: Number,
          min: PLATFORM_TTL_VERIFICATION_MIN,
          max: PLATFORM_TTL_VERIFICATION_MAX,
          default: 30,
        },
        resetMinutes: {
          type: Number,
          min: PLATFORM_TTL_RESET_MIN,
          max: PLATFORM_TTL_RESET_MAX,
          default: 30,
        },
        resendSeconds: {
          type: Number,
          min: PLATFORM_TTL_RESEND_MIN,
          max: PLATFORM_TTL_RESEND_MAX,
          default: 60,
        },
      },
    },
    newChurchDefaults: {
      timezone: { type: String, trim: true, maxlength: 64, default: 'America/Sao_Paulo' },
      visitorFollowUpEnabled: { type: Boolean, default: false },
      modules: {
        visitorFollowUpEnabled: { type: Boolean, default: false },
      },
      retention: { type: retentionDefaultsSchema, default: () => ({ enabled: false, ...RETENTION_DEFAULTS }) },
    },
    maintenance: {
      enabled: { type: Boolean, default: false },
      message: { type: String, trim: true, maxlength: PLATFORM_MAINTENANCE_MESSAGE_MAX, default: '' },
      windows: { type: [maintenanceWindowSchema], default: [] },
    },
    limits: {
      maxChurches: { type: Number, min: PLATFORM_LIMIT_CHURCHES_MIN, max: PLATFORM_LIMIT_CHURCHES_MAX, default: null },
      maxPendingApprovals: { type: Number, min: PLATFORM_LIMIT_PENDING_MIN, max: PLATFORM_LIMIT_PENDING_MAX, default: null },
    },
    legal: {
      termsUrl: { type: String, trim: true, maxlength: PLATFORM_LEGAL_URL_MAX, default: '' },
      privacyUrl: { type: String, trim: true, maxlength: PLATFORM_LEGAL_URL_MAX, default: '' },
    },
    notice: {
      enabled: { type: Boolean, default: false },
      message: { type: String, trim: true, maxlength: PLATFORM_NOTICE_MESSAGE_MAX, default: '' },
      tone: { type: String, enum: ['info', 'warning'], default: 'info' },
    },
  },
  { timestamps: true, strict: true, bufferCommands: false }
);

platformSettingsSchema.index({ key: 1 }, { unique: true });

export const PlatformSettings = mongoose.model<IPlatformSettings>(
  'PlatformSettings',
  platformSettingsSchema
);
