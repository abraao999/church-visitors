import mongoose, { Schema, Document } from 'mongoose';
import { RELATIONSHIPS, type IFamilyMember, type Relationship } from '../constants/relationships.js';

export interface IVisitor extends Document {
  familyName: string;
  members: IFamilyMember[];
  origin: string;
  visitDate: Date;
  createdAt: Date;
}

const memberSchema = new Schema<IFamilyMember>(
  {
    name: { type: String, required: true, trim: true },
    relationship: { type: String, enum: RELATIONSHIPS, required: true },
  },
  { _id: false }
);

const visitorSchema = new Schema<IVisitor>(
  {
    familyName: { type: String, required: true, trim: true },
    members: {
      type: [memberSchema],
      required: true,
      validate: [(v: IFamilyMember[]) => v.length > 0, 'Informe ao menos um membro'],
    },
    origin: { type: String, required: true, trim: true },
    visitDate: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export { RELATIONSHIPS, type Relationship };
export const Visitor = mongoose.model<IVisitor>('Visitor', visitorSchema);
