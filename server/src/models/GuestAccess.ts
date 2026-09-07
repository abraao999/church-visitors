import mongoose, { Document, Schema, Types } from 'mongoose';
import { actorSchema, type IActor } from './Actor.js';

export const GUEST_ACCESS_TYPES = [
  'visitors:create',
  'prayers:create',
  'vehicle_notices:create',
  'panels:read',
] as const;
export type GuestAccessType = (typeof GUEST_ACCESS_TYPES)[number];

/** Permissões de envio, entregues a quem visita a igreja. */
export const GUEST_ACCESS_FORM_TYPES = [
  'visitors:create',
  'prayers:create',
  'vehicle_notices:create',
] as const;

/**
 * Leitura para as TVs. Fica separada das permissões de envio: um link de
 * painel nunca deve ir para a mão do visitante, nem o contrário.
 */
export function isPanelGuestAccessType(type: GuestAccessType): boolean {
  return type === 'panels:read';
}

export interface IGuestAccess extends Document {
  churchId: Types.ObjectId;
  createdBy: IActor;
  name: string;
  publicId: string;
  type: GuestAccessType;
  types: GuestAccessType[];
  version: number;
  active: boolean;
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const guestAccessSchema = new Schema<IGuestAccess>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true },
    createdBy: { type: actorSchema, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    publicId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      minlength: 32,
      maxlength: 32,
    },
    type: { type: String, enum: GUEST_ACCESS_TYPES, required: true },
    types: {
      type: [{ type: String, enum: GUEST_ACCESS_TYPES }],
      default: undefined,
    },
    version: { type: Number, required: true, default: 1, min: 1 },
    active: { type: Boolean, required: true, default: true },
    expiresAt: { type: Date },
    lastUsedAt: { type: Date },
  },
  { timestamps: true }
);

guestAccessSchema.index({ churchId: 1, active: 1 });
guestAccessSchema.index({ churchId: 1, expiresAt: 1 });
guestAccessSchema.index({ churchId: 1, active: 1, updatedAt: 1 });

export const GuestAccess = mongoose.model<IGuestAccess>('GuestAccess', guestAccessSchema);
