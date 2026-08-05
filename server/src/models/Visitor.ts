import mongoose, { Schema, Document } from 'mongoose';
import { RELATIONSHIPS, type Relationship } from '../constants/relationships.js';
import { actorSchema, type IActor } from './Actor.js';

export interface IVisitor extends Document {
  name: string;
  relationship: Relationship;
  city: string;
  visitDate: Date;
  createdBy?: IActor;
  createdAt: Date;
}

const visitorSchema = new Schema<IVisitor>(
  {
    name: { type: String, required: true, trim: true },
    relationship: { type: String, enum: RELATIONSHIPS, required: true },
    city: { type: String, required: true, trim: true },
    visitDate: { type: Date, default: Date.now },
    createdBy: { type: actorSchema, required: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export { RELATIONSHIPS, type Relationship };
export const Visitor = mongoose.model<IVisitor>('Visitor', visitorSchema);
