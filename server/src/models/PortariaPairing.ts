import mongoose, { Schema, Document, Types } from 'mongoose';
import { actorSchema, type IActor } from './Actor.js';

export interface IPortariaPairing extends Document {
  churchId: Types.ObjectId;
  publicId: string;
  createdBy: IActor;
  expiresAt: Date;
  consumedAt?: Date;
  deviceId?: Types.ObjectId;
  createdAt: Date;
}

const portariaPairingSchema = new Schema<IPortariaPairing>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true },
    publicId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      minlength: 32,
      maxlength: 32,
    },
    createdBy: { type: actorSchema, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
    deviceId: { type: Schema.Types.ObjectId, ref: 'PortariaDevice' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

portariaPairingSchema.index({ churchId: 1, createdAt: -1 });
portariaPairingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export const PortariaPairing = mongoose.model<IPortariaPairing>(
  'PortariaPairing',
  portariaPairingSchema
);
