import mongoose, { Document, Schema } from 'mongoose';

export interface ChurchBranding {
  logoUrl?: string;
  logoStorageKey?: string;
  primaryColor?: string;
  accentColor?: string;
  updatedAt?: Date;
}

export interface IChurch extends Document {
  name: string;
  slug: string;
  city?: string;
  phone?: string;
  address?: string;
  timezone?: string;
  active: boolean;
  visitorFollowUpEnabled?: boolean;
  branding?: ChurchBranding;
  createdAt: Date;
  updatedAt: Date;
}

const churchSchema = new Schema<IChurch>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // O slug existe apenas para apresentação. Nunca deve ser usado como autorização.
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    city: { type: String, trim: true, maxlength: 100, default: '' },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    address: { type: String, trim: true, maxlength: 200, default: '' },
    timezone: { type: String, trim: true, default: 'America/Sao_Paulo', maxlength: 64 },
    active: { type: Boolean, default: true, index: true },
    visitorFollowUpEnabled: { type: Boolean, default: false },
    branding: {
      type: new Schema(
        {
          logoUrl: { type: String, trim: true, maxlength: 500 },
          logoStorageKey: { type: String, trim: true, maxlength: 300 },
          primaryColor: { type: String, trim: true, maxlength: 7 },
          accentColor: { type: String, trim: true, maxlength: 7 },
          updatedAt: { type: Date },
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  { timestamps: true }
);

churchSchema.index({ active: 1, createdAt: -1 });
churchSchema.index({ createdAt: -1 });

export const Church = mongoose.model<IChurch>('Church', churchSchema);
