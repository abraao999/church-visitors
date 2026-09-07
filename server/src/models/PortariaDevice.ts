import mongoose, { Schema, Document, Types } from 'mongoose';
import { actorSchema, type IActor } from './Actor.js';
import {
  PORTARIA_DEVICE_PERMISSIONS,
  type PortariaDevicePermission,
} from '../utils/portariaToken.js';

export type { PortariaDevicePermission };

export interface IPortariaDevice extends Document {
  churchId: Types.ObjectId;
  name: string;
  publicId: string;
  credentialVersion: number;
  permissions: PortariaDevicePermission[];
  active: boolean;
  createdBy: IActor;
  lastUsedAt?: Date;
  revokedAt?: Date;
  revokedBy?: IActor;
  userAgentFamily?: string;
  createdAt: Date;
  updatedAt: Date;
}

const portariaDeviceSchema = new Schema<IPortariaDevice>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    publicId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      minlength: 32,
      maxlength: 32,
    },
    credentialVersion: { type: Number, required: true, min: 1, default: 1 },
    permissions: {
      type: [String],
      enum: PORTARIA_DEVICE_PERMISSIONS,
      required: true,
      validate: {
        validator: (value: string[]) => value.length > 0,
        message: 'Selecione pelo menos uma permissão offline.',
      },
    },
    active: { type: Boolean, required: true, default: true },
    createdBy: { type: actorSchema, required: true },
    lastUsedAt: { type: Date },
    revokedAt: { type: Date },
    revokedBy: { type: actorSchema, required: false },
    userAgentFamily: { type: String, trim: true, maxlength: 40 },
  },
  { timestamps: true }
);

portariaDeviceSchema.index({ churchId: 1, active: 1, createdAt: -1 });

export const PortariaDevice = mongoose.model<IPortariaDevice>(
  'PortariaDevice',
  portariaDeviceSchema
);
