import mongoose, { Document, Schema, Types } from 'mongoose';
import { actorSchema, type IActor } from './Actor.js';
import {
  FOLLOW_UP_STATUSES,
  type FollowUpStatus,
} from '../utils/visitorFollowUp.js';

export type FollowUpSource = 'owner' | 'guest_access' | 'portaria_device';

export interface IVisitorFollowUp extends Document {
  churchId: Types.ObjectId;
  visitorId: Types.ObjectId;
  phone: string;
  assignedTo?: Types.ObjectId;
  assignedToName?: string;
  status: FollowUpStatus;
  nextContactAt?: Date;
  consent: boolean;
  source: FollowUpSource;
  createdBy?: IActor;
  updatedBy?: IActor;
  anonymizedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const visitorFollowUpSchema = new Schema<IVisitorFollowUp>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true },
    visitorId: { type: Schema.Types.ObjectId, ref: 'Visitor', required: true },
    phone: { type: String, trim: true, maxlength: 13, default: '' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedToName: { type: String, trim: true, maxlength: 120, default: '' },
    status: { type: String, enum: FOLLOW_UP_STATUSES, default: 'awaiting', required: true },
    nextContactAt: { type: Date },
    consent: { type: Boolean, default: false },
    source: {
      type: String,
      enum: ['owner', 'guest_access', 'portaria_device'],
      default: 'owner',
    },
    createdBy: { type: actorSchema, required: false },
    updatedBy: { type: actorSchema, required: false },
    anonymizedAt: { type: Date },
  },
  { timestamps: true }
);

visitorFollowUpSchema.index({ churchId: 1, visitorId: 1 }, { unique: true });
visitorFollowUpSchema.index({ churchId: 1, status: 1, nextContactAt: 1 });
visitorFollowUpSchema.index({ churchId: 1, nextContactAt: 1, createdAt: -1 });
visitorFollowUpSchema.index({ churchId: 1, assignedTo: 1 });

export const VisitorFollowUp = mongoose.model<IVisitorFollowUp>(
  'VisitorFollowUp',
  visitorFollowUpSchema
);
