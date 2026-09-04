import mongoose, { Document, Schema, Types } from 'mongoose';
import { actorSchema, type IActor } from './Actor.js';
import { guestOriginSchema, type IGuestOrigin } from './GuestOrigin.js';

export const VEHICLE_NOTICE_ACTIONS = [
  'remove_vehicle',
  'turn_off_lights',
  'close_door_or_window',
  'reposition_vehicle',
  'other',
] as const;

export type VehicleNoticeAction = (typeof VEHICLE_NOTICE_ACTIONS)[number];

export const VEHICLE_NOTICE_STATUSES = ['pending', 'announced', 'resolved'] as const;
export type VehicleNoticeStatus = (typeof VEHICLE_NOTICE_STATUSES)[number];

export type VehicleNoticeSource = 'guest_access' | 'owner';

export interface IVehicleNotice extends Document {
  churchId: Types.ObjectId;
  guestAccessId?: Types.ObjectId;
  plate: string;
  plateNormalized: string;
  vehicleModel: string;
  requestedAction: VehicleNoticeAction;
  details?: string;
  status: VehicleNoticeStatus;
  source: VehicleNoticeSource;
  createdBy?: IActor;
  guestAccess?: IGuestOrigin;
  announcedAt?: Date;
  announcedBy?: Types.ObjectId;
  resolvedAt?: Date;
  resolvedBy?: Types.ObjectId;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const vehicleNoticeSchema = new Schema<IVehicleNotice>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true },
    guestAccessId: { type: Schema.Types.ObjectId, ref: 'GuestAccess' },
    plate: { type: String, required: true, trim: true, maxlength: 8 },
    plateNormalized: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 7,
      index: true,
    },
    vehicleModel: { type: String, required: true, trim: true, maxlength: 120 },
    requestedAction: {
      type: String,
      enum: VEHICLE_NOTICE_ACTIONS,
      required: true,
    },
    details: { type: String, trim: true, maxlength: 500, default: '' },
    status: {
      type: String,
      enum: VEHICLE_NOTICE_STATUSES,
      required: true,
      default: 'pending',
    },
    source: {
      type: String,
      enum: ['guest_access', 'owner'],
      required: true,
      default: 'guest_access',
    },
    createdBy: { type: actorSchema, required: false },
    guestAccess: { type: guestOriginSchema, required: false },
    announcedAt: { type: Date },
    announcedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true }
);

vehicleNoticeSchema.index({ churchId: 1, status: 1, createdAt: -1 });
vehicleNoticeSchema.index({ churchId: 1, plateNormalized: 1, createdAt: -1 });
vehicleNoticeSchema.index({ guestAccessId: 1, createdAt: -1 });

export function isVehicleNoticeAction(value: unknown): value is VehicleNoticeAction {
  return (
    typeof value === 'string' &&
    VEHICLE_NOTICE_ACTIONS.includes(value as VehicleNoticeAction)
  );
}

export function isVehicleNoticeStatus(value: unknown): value is VehicleNoticeStatus {
  return (
    typeof value === 'string' &&
    VEHICLE_NOTICE_STATUSES.includes(value as VehicleNoticeStatus)
  );
}

export const VehicleNotice = mongoose.model<IVehicleNotice>(
  'VehicleNotice',
  vehicleNoticeSchema
);
