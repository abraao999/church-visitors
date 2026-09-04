import mongoose, { Schema, Document, Types } from 'mongoose';
import { RELATIONSHIPS, type Relationship } from '../constants/relationships.js';
import { actorSchema, type IActor } from './Actor.js';
import { guestOriginSchema, type IGuestOrigin } from './GuestOrigin.js';

export type VisitorSource = 'owner' | 'guest_access';

export interface IVisitor extends Document {
  /** Transitório: será obrigatório somente depois da migração controlada. */
  churchId?: Types.ObjectId;
  name: string;
  relationship: Relationship;
  city: string;
  visitDate: Date;
  source: VisitorSource;
  createdBy?: IActor;
  guestAccess?: IGuestOrigin;
  createdAt: Date;
}

const visitorSchema = new Schema<IVisitor>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church' },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    relationship: { type: String, enum: RELATIONSHIPS, required: true, default: 'outro' },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    visitDate: { type: Date, default: Date.now },
    source: { type: String, enum: ['owner', 'guest_access'], default: 'owner' },
    createdBy: { type: actorSchema, required: false },
    guestAccess: { type: guestOriginSchema, required: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

visitorSchema.index({ churchId: 1, createdAt: -1 });
visitorSchema.index({ churchId: 1, 'guestAccess.guestAccessId': 1 });

export { RELATIONSHIPS, type Relationship };
export const Visitor = mongoose.model<IVisitor>('Visitor', visitorSchema);
