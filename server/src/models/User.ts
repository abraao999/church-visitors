import mongoose, { Schema, Document } from 'mongoose';

export type AuthProvider = 'local' | 'google';

export interface IUser extends Document {
  name: string;
  email: string;
  username?: string;
  passwordHash?: string;
  googleId?: string;
  provider: AuthProvider;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    username: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
    passwordHash: { type: String },
    googleId: { type: String, sparse: true, unique: true },
    provider: { type: String, enum: ['local', 'google'], required: true },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);
