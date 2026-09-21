import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWorkTeam extends Document {
  churchId: Types.ObjectId;
  name: string;
  description?: string;
  icon: string;
  color: string;
  leaderName?: string;
  minVolunteers: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const workTeamSchema = new Schema<IWorkTeam>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 160, default: '' },
    icon: { type: String, trim: true, maxlength: 32, default: 'users' },
    color: { type: String, trim: true, maxlength: 24, default: 'blue' },
    leaderName: { type: String, trim: true, maxlength: 120, default: '' },
    minVolunteers: { type: Number, min: 1, max: 50, default: 1 },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

workTeamSchema.index({ churchId: 1, name: 1 }, { unique: true });
workTeamSchema.index({ churchId: 1, active: 1, name: 1 });

export const WorkTeam = mongoose.model<IWorkTeam>('WorkTeam', workTeamSchema);
