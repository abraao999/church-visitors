import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IVolunteer extends Document {
  churchId: Types.ObjectId;
  name: string;
  phone?: string;
  teamIds: Types.ObjectId[];
  availability?: string;
  notes?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const volunteerSchema = new Schema<IVolunteer>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 24, default: '' },
    teamIds: [{ type: Schema.Types.ObjectId, ref: 'WorkTeam' }],
    availability: { type: String, trim: true, maxlength: 120, default: '' },
    notes: { type: String, trim: true, maxlength: 240, default: '' },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

volunteerSchema.index({ churchId: 1, active: 1, name: 1 });
volunteerSchema.index({ churchId: 1, teamIds: 1 });

export const Volunteer = mongoose.model<IVolunteer>('Volunteer', volunteerSchema);
