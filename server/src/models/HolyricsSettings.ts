import mongoose, { Schema, Document, Types } from 'mongoose';

export type HolyricsMode = 'local' | 'internet';

export interface IHolyricsSettings extends Document {
  churchId: Types.ObjectId;
  mode: HolyricsMode;
  host: string;
  port: number;
  token: string;
  apiKey: string;
  updatedAt: Date;
}

const holyricsSettingsSchema = new Schema<IHolyricsSettings>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true, unique: true },
    mode: { type: String, enum: ['local', 'internet'], default: 'local' },
    host: { type: String, default: '127.0.0.1', trim: true },
    port: { type: Number, default: 8091 },
    token: { type: String, default: '', trim: true },
    apiKey: { type: String, default: '', trim: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const HolyricsSettings = mongoose.model<IHolyricsSettings>(
  'HolyricsSettings',
  holyricsSettingsSchema
);
