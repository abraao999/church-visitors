import mongoose, { Schema, Document, Types } from 'mongoose';

export const SCHEDULE_ASSIGNMENT_STATUSES = [
  'scheduled',
  'confirmed',
  'declined',
  'served',
  'absent',
] as const;

export type ScheduleAssignmentStatus = (typeof SCHEDULE_ASSIGNMENT_STATUSES)[number];

export interface IServiceScheduleAssignment {
  volunteerId: Types.ObjectId;
  volunteerName: string;
  status: ScheduleAssignmentStatus;
  note?: string;
}

export interface IServiceScheduleTeam {
  teamId: Types.ObjectId;
  teamName: string;
  minVolunteers: number;
  assignments: IServiceScheduleAssignment[];
}

export interface IServiceSchedule extends Document {
  churchId: Types.ObjectId;
  serviceId: Types.ObjectId;
  teams: IServiceScheduleTeam[];
  createdAt: Date;
  updatedAt: Date;
}

const assignmentSchema = new Schema<IServiceScheduleAssignment>(
  {
    volunteerId: { type: Schema.Types.ObjectId, ref: 'Volunteer', required: true },
    volunteerName: { type: String, required: true, trim: true, maxlength: 120 },
    status: {
      type: String,
      enum: SCHEDULE_ASSIGNMENT_STATUSES,
      default: 'scheduled',
    },
    note: { type: String, trim: true, maxlength: 180, default: '' },
  },
  { _id: false }
);

const scheduleTeamSchema = new Schema<IServiceScheduleTeam>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: 'WorkTeam', required: true },
    teamName: { type: String, required: true, trim: true, maxlength: 80 },
    minVolunteers: { type: Number, min: 1, max: 50, default: 1 },
    assignments: { type: [assignmentSchema], default: [] },
  },
  { _id: false }
);

const serviceScheduleSchema = new Schema<IServiceSchedule>(
  {
    churchId: { type: Schema.Types.ObjectId, ref: 'Church', required: true, index: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true, index: true },
    teams: { type: [scheduleTeamSchema], default: [] },
  },
  { timestamps: true }
);

serviceScheduleSchema.index({ churchId: 1, serviceId: 1 }, { unique: true });

export const ServiceSchedule = mongoose.model<IServiceSchedule>(
  'ServiceSchedule',
  serviceScheduleSchema
);
