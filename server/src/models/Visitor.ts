import mongoose, { Schema, Document, Types } from 'mongoose';
import { RELATIONSHIPS, type Relationship } from '../constants/relationships.js';
import { REQUEST_ID_UNIQUE_INDEX } from '../utils/requestIdIndex.js';
import { actorSchema, type IActor } from './Actor.js';
import { guestOriginSchema, type IGuestOrigin } from './GuestOrigin.js';

export type VisitorSource = 'owner' | 'guest_access' | 'portaria_device';

export interface IVisitor extends Document {
  churchId: Types.ObjectId;
  name: string;
  relationship: Relationship;
  city: string;
  visitDate: Date;
  source: VisitorSource;
  createdBy?: IActor;
  guestAccess?: IGuestOrigin;
  portariaDevice?: { deviceId: Types.ObjectId; name: string };
  /** Idempotência do formulário público; só o primeiro visitante do lote leva o valor. */
  requestId?: string;
  serviceId?: Types.ObjectId;
  capturedAt?: Date;
  anonymizedAt?: Date;
  createdAt: Date;
}

const visitorSchema = new Schema<IVisitor>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    relationship: { type: String, enum: RELATIONSHIPS, required: true, default: 'outro' },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    visitDate: { type: Date, default: Date.now },
    source: { type: String, enum: ['owner', 'guest_access', 'portaria_device'], default: 'owner' },
    createdBy: { type: actorSchema, required: false },
    guestAccess: { type: guestOriginSchema, required: false },
    portariaDevice: {
      type: new Schema(
        {
          deviceId: { type: Schema.Types.ObjectId, ref: 'PortariaDevice', required: true },
          name: { type: String, required: true, trim: true, maxlength: 80 },
        },
        { _id: false }
      ),
      required: false,
    },
    requestId: { type: String, trim: true, maxlength: 64 },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service' },
    capturedAt: { type: Date },
    anonymizedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

visitorSchema.index({ churchId: 1, createdAt: -1 });
visitorSchema.index({ churchId: 1, 'guestAccess.guestAccessId': 1 });
visitorSchema.index({ churchId: 1, requestId: 1 }, REQUEST_ID_UNIQUE_INDEX);
visitorSchema.index({ churchId: 1, serviceId: 1, createdAt: -1 });
visitorSchema.index({ churchId: 1, anonymizedAt: 1, visitDate: 1 });

export { RELATIONSHIPS, type Relationship };
export const Visitor = mongoose.model<IVisitor>('Visitor', visitorSchema);
