import mongoose, { Schema, Document, Types } from 'mongoose';

export type UserRole = 'owner';

export interface IUser extends Document {
  name: string;
  email: string;
  username?: string;
  passwordHash?: string;
  churchId: Types.ObjectId;
  role: UserRole;
  /** Sobe a cada logout ou troca de senha; invalida JWTs anteriores. */
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    username: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
    passwordHash: { type: String },
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
    role: { type: String, enum: ['owner'], default: 'owner' },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);
