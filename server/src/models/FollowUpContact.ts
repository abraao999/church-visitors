import mongoose, { Document, Schema, Types } from 'mongoose';
import { actorSchema, type IActor } from './Actor.js';
import {
  FOLLOW_UP_CONTACT_TYPES,
  FOLLOW_UP_STATUSES,
  type FollowUpContactType,
  type FollowUpStatus,
} from '../utils/visitorFollowUp.js';

export interface IFollowUpContact extends Document {
  churchId: Types.ObjectId;
  followUpId: Types.ObjectId;
  visitorId: Types.ObjectId;
  contactedAt: Date;
  type: FollowUpContactType;
  result: string;
  note: string;
  nextContactAt?: Date;
  status: FollowUpStatus;
  createdBy?: IActor;
  createdAt: Date;
}

const followUpContactSchema = new Schema<IFollowUpContact>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true },
    followUpId: { type: Schema.Types.ObjectId, ref: 'VisitorFollowUp', required: true },
    visitorId: { type: Schema.Types.ObjectId, ref: 'Visitor', required: true },
    contactedAt: { type: Date, required: true },
    type: { type: String, enum: FOLLOW_UP_CONTACT_TYPES, required: true },
    result: { type: String, required: true, trim: true, maxlength: 200 },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    nextContactAt: { type: Date },
    status: { type: String, enum: FOLLOW_UP_STATUSES, required: true },
    createdBy: { type: actorSchema, required: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

followUpContactSchema.index({ churchId: 1, followUpId: 1, createdAt: -1 });
followUpContactSchema.index({ churchId: 1, visitorId: 1, createdAt: -1 });

export const FollowUpContact = mongoose.model<IFollowUpContact>(
  'FollowUpContact',
  followUpContactSchema
);
