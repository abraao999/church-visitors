import { Schema, Types } from 'mongoose';

export interface IActor {
  userId: Types.ObjectId;
  name: string;
}

export const actorSchema = new Schema<IActor>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
  },
  { _id: false }
);
