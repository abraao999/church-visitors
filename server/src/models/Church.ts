import mongoose, { Document, Schema } from 'mongoose';

export interface IChurch extends Document {
  name: string;
  slug: string;
  city?: string;
  phone?: string;
  address?: string;
  active: boolean;
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
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const Church = mongoose.model<IChurch>('Church', churchSchema);
