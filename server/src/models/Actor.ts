import { Schema, Types } from 'mongoose';

export interface IActor {
  userId: Types.ObjectId;
  name: string;
  /** Transitório para auditoria de dados anteriores à adoção de multi-tenancy. */
  churchId?: Types.ObjectId;
}

export const actorSchema = new Schema<IActor>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    churchId: { type: Schema.Types.ObjectId, ref: 'Church' },
  },
  { _id: false }
);
