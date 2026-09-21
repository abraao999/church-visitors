import { Router, Response } from 'express';
import { Types } from 'mongoose';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission, requirePermission } from '../middleware/requirePermission.js';
import { Service } from '../models/Service.js';
import { ServiceSchedule } from '../models/ServiceSchedule.js';
import { Volunteer } from '../models/Volunteer.js';
import { WorkTeam } from '../models/WorkTeam.js';
import { sendPrivateJson, serializeService, SERVICE_LIST_FIELDS } from '../utils/publicRecord.js';
import { withChurch } from '../utils/tenant.js';

const router = Router();

type ScheduleStatus = 'scheduled' | 'confirmed' | 'declined' | 'served' | 'absent';

const STATUS_SET = new Set<ScheduleStatus>(['scheduled', 'confirmed', 'declined', 'served', 'absent']);

type RawScheduleAssignment = {
  volunteerId?: unknown;
  status?: unknown;
  note?: unknown;
};

type RawScheduleTeam = {
  teamId?: unknown;
  assignments?: unknown;
};

function asObjectId(value: unknown): Types.ObjectId | null {
  if (typeof value !== 'string' || !Types.ObjectId.isValid(value)) return null;
  return new Types.ObjectId(value);
}

function trimText(value: unknown, max = 120): string {
  return String(value ?? '').trim().slice(0, max);
}

function serializeTeam(team: {
  _id?: unknown;
  name: string;
  description?: string;
  icon: string;
  color: string;
  leaderName?: string;
  minVolunteers: number;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: String(team._id),
    name: team.name,
    description: team.description || '',
    icon: team.icon,
    color: team.color,
    leaderName: team.leaderName || '',
    minVolunteers: team.minVolunteers,
    active: team.active,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  };
}

function serializeVolunteer(volunteer: {
  _id?: unknown;
  name: string;
  phone?: string;
  teamIds?: unknown[];
  availability?: string;
  notes?: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: String(volunteer._id),
    name: volunteer.name,
    phone: volunteer.phone || '',
    teamIds: (volunteer.teamIds ?? []).map(String),
    availability: volunteer.availability || '',
    notes: volunteer.notes || '',
    active: volunteer.active,
    createdAt: volunteer.createdAt,
    updatedAt: volunteer.updatedAt,
  };
}

function serializeSchedule(schedule: {
  _id?: unknown;
  serviceId: unknown;
  teams: Array<{
    teamId: unknown;
    teamName: string;
    minVolunteers: number;
    assignments?: Array<{
      volunteerId: unknown;
      volunteerName: string;
      status: string;
      note?: string;
    }>;
  }>;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: String(schedule._id),
    serviceId: String(schedule.serviceId),
    teams: schedule.teams.map((team) => ({
      teamId: String(team.teamId),
      teamName: team.teamName,
      minVolunteers: team.minVolunteers,
      assignments: (team.assignments ?? []).map((assignment) => ({
        volunteerId: String(assignment.volunteerId),
        volunteerName: assignment.volunteerName,
        status: STATUS_SET.has(assignment.status as ScheduleStatus)
          ? assignment.status
          : 'scheduled',
        note: assignment.note || '',
      })),
    })),
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
}

router.get(
  '/teams',
  requireAuth,
  requireAnyPermission('schedules:read', 'schedules:manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const teams = await WorkTeam.find(withChurch(req.auth!.churchId))
        .sort({ active: -1, name: 1 });
      return sendPrivateJson(res, teams.map(serializeTeam));
    } catch {
      return res.status(500).json({ error: 'Erro ao buscar equipes de escala' });
    }
  }
);

router.post(
  '/teams',
  requireAuth,
  requirePermission('schedules:manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const name = trimText(req.body?.name, 80);
      if (!name) return res.status(400).json({ error: 'Informe o nome da equipe.' });

      const team = await WorkTeam.create({
        churchId: req.auth!.churchId,
        name,
        description: trimText(req.body?.description, 160),
        icon: trimText(req.body?.icon, 32) || 'users',
        color: trimText(req.body?.color, 24) || 'blue',
        leaderName: trimText(req.body?.leaderName, 120),
        minVolunteers: Math.min(Math.max(Number(req.body?.minVolunteers) || 1, 1), 50),
        active: req.body?.active !== false,
      });
      return sendPrivateJson(res, serializeTeam(team), 201);
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        return res.status(409).json({ error: 'Já existe uma equipe com esse nome.' });
      }
      return res.status(500).json({ error: 'Erro ao criar equipe' });
    }
  }
);

router.patch(
  '/teams/:id',
  requireAuth,
  requirePermission('schedules:manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = asObjectId(req.params.id);
      if (!id) return res.status(400).json({ error: 'Equipe inválida.' });
      const team = await WorkTeam.findOne(withChurch(req.auth!.churchId, { _id: id }));
      if (!team) return res.status(404).json({ error: 'Equipe não encontrada.' });

      if (req.body?.name != null) {
        const name = trimText(req.body.name, 80);
        if (!name) return res.status(400).json({ error: 'Informe o nome da equipe.' });
        team.name = name;
      }
      if (req.body?.description != null) team.description = trimText(req.body.description, 160);
      if (req.body?.icon != null) team.icon = trimText(req.body.icon, 32) || 'users';
      if (req.body?.color != null) team.color = trimText(req.body.color, 24) || 'blue';
      if (req.body?.leaderName != null) team.leaderName = trimText(req.body.leaderName, 120);
      if (req.body?.minVolunteers != null) {
        team.minVolunteers = Math.min(Math.max(Number(req.body.minVolunteers) || 1, 1), 50);
      }
      if (req.body?.active != null) team.active = req.body.active === true;
      await team.save();
      return sendPrivateJson(res, serializeTeam(team));
    } catch {
      return res.status(500).json({ error: 'Erro ao atualizar equipe' });
    }
  }
);

router.get(
  '/volunteers',
  requireAuth,
  requireAnyPermission('schedules:read', 'schedules:manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const volunteers = await Volunteer.find(withChurch(req.auth!.churchId))
        .sort({ active: -1, name: 1 });
      return sendPrivateJson(res, volunteers.map(serializeVolunteer));
    } catch {
      return res.status(500).json({ error: 'Erro ao buscar voluntários' });
    }
  }
);

router.post(
  '/volunteers',
  requireAuth,
  requirePermission('schedules:manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const name = trimText(req.body?.name, 120);
      if (!name) return res.status(400).json({ error: 'Informe o nome do voluntário.' });
      const teamIds = Array.isArray(req.body?.teamIds)
        ? req.body.teamIds.map(asObjectId).filter(Boolean)
        : [];
      const validTeams = await WorkTeam.find(withChurch(req.auth!.churchId, { _id: { $in: teamIds } })).select('_id');

      const volunteer = await Volunteer.create({
        churchId: req.auth!.churchId,
        name,
        phone: trimText(req.body?.phone, 24),
        teamIds: validTeams.map((team) => team._id),
        availability: trimText(req.body?.availability, 120),
        notes: trimText(req.body?.notes, 240),
        active: req.body?.active !== false,
      });
      return sendPrivateJson(res, serializeVolunteer(volunteer), 201);
    } catch {
      return res.status(500).json({ error: 'Erro ao criar voluntário' });
    }
  }
);

router.patch(
  '/volunteers/:id',
  requireAuth,
  requirePermission('schedules:manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = asObjectId(req.params.id);
      if (!id) return res.status(400).json({ error: 'Voluntário inválido.' });
      const volunteer = await Volunteer.findOne(withChurch(req.auth!.churchId, { _id: id }));
      if (!volunteer) return res.status(404).json({ error: 'Voluntário não encontrado.' });

      if (req.body?.name != null) {
        const name = trimText(req.body.name, 120);
        if (!name) return res.status(400).json({ error: 'Informe o nome do voluntário.' });
        volunteer.name = name;
      }
      if (req.body?.phone != null) volunteer.phone = trimText(req.body.phone, 24);
      if (req.body?.availability != null) volunteer.availability = trimText(req.body.availability, 120);
      if (req.body?.notes != null) volunteer.notes = trimText(req.body.notes, 240);
      if (req.body?.active != null) volunteer.active = req.body.active === true;
      if (Array.isArray(req.body?.teamIds)) {
        const teamIds = req.body.teamIds.map(asObjectId).filter(Boolean);
        const validTeams = await WorkTeam.find(withChurch(req.auth!.churchId, { _id: { $in: teamIds } })).select('_id');
        volunteer.teamIds = validTeams.map((team) => team._id);
      }
      await volunteer.save();
      return sendPrivateJson(res, serializeVolunteer(volunteer));
    } catch {
      return res.status(500).json({ error: 'Erro ao atualizar voluntário' });
    }
  }
);

router.get(
  '/services/:serviceId',
  requireAuth,
  requireAnyPermission('schedules:read', 'schedules:manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const serviceId = asObjectId(req.params.serviceId);
      if (!serviceId) return res.status(400).json({ error: 'Culto inválido.' });
      const service = await Service.findOne(withChurch(req.auth!.churchId, { _id: serviceId })).select('_id');
      if (!service) return res.status(404).json({ error: 'Culto não encontrado.' });

      const schedule = await ServiceSchedule.findOne(withChurch(req.auth!.churchId, { serviceId }));
      if (!schedule) {
        return sendPrivateJson(res, {
          id: '',
          serviceId: String(serviceId),
          teams: [],
          createdAt: undefined,
          updatedAt: undefined,
        });
      }
      return sendPrivateJson(res, serializeSchedule(schedule));
    } catch {
      return res.status(500).json({ error: 'Erro ao buscar escala' });
    }
  }
);

router.put(
  '/services/:serviceId',
  requireAuth,
  requirePermission('schedules:manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const serviceId = asObjectId(req.params.serviceId);
      if (!serviceId) return res.status(400).json({ error: 'Culto inválido.' });
      const service = await Service.findOne(withChurch(req.auth!.churchId, { _id: serviceId })).select('_id');
      if (!service) return res.status(404).json({ error: 'Culto não encontrado.' });

      const rawTeams: RawScheduleTeam[] = Array.isArray(req.body?.teams) ? req.body.teams : [];
      const requestedTeamIds = rawTeams.map((team) => asObjectId(team?.teamId)).filter(Boolean);
      const requestedVolunteerIds = rawTeams
        .flatMap((team) => (Array.isArray(team?.assignments) ? team.assignments : []) as RawScheduleAssignment[])
        .map((assignment) => asObjectId(assignment?.volunteerId))
        .filter(Boolean);

      const [teams, volunteers] = await Promise.all([
        WorkTeam.find(withChurch(req.auth!.churchId, { _id: { $in: requestedTeamIds } })),
        Volunteer.find(withChurch(req.auth!.churchId, { _id: { $in: requestedVolunteerIds } })),
      ]);
      const teamsById = new Map(teams.map((team) => [String(team._id), team]));
      const volunteersById = new Map(volunteers.map((volunteer) => [String(volunteer._id), volunteer]));

      const normalizedTeams = rawTeams.flatMap((rawTeam) => {
        const teamId = asObjectId(rawTeam?.teamId);
        if (!teamId) return [];
        const team = teamsById.get(String(teamId));
        if (!team) return [];
        const seenVolunteers = new Set<string>();
        const assignments = ((Array.isArray(rawTeam?.assignments) ? rawTeam.assignments : []) as RawScheduleAssignment[]).flatMap((rawAssignment) => {
          const volunteerId = asObjectId(rawAssignment?.volunteerId);
          if (!volunteerId) return [];
          const volunteer = volunteersById.get(String(volunteerId));
          if (!volunteer || seenVolunteers.has(String(volunteerId))) return [];
          seenVolunteers.add(String(volunteerId));
          const rawStatus = String(rawAssignment?.status ?? 'scheduled');
          const status = STATUS_SET.has(rawStatus as ScheduleStatus) ? rawStatus : 'scheduled';
          return [{
            volunteerId,
            volunteerName: volunteer.name,
            status,
            note: trimText(rawAssignment?.note, 180),
          }];
        });
        return [{
          teamId,
          teamName: team.name,
          minVolunteers: team.minVolunteers,
          assignments,
        }];
      });

      const schedule = await ServiceSchedule.findOneAndUpdate(
        withChurch(req.auth!.churchId, { serviceId }),
        {
          churchId: req.auth!.churchId,
          serviceId,
          teams: normalizedTeams,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      return sendPrivateJson(res, serializeSchedule(schedule));
    } catch {
      return res.status(500).json({ error: 'Erro ao salvar escala' });
    }
  }
);

router.get(
  '/overview',
  requireAuth,
  requireAnyPermission('schedules:read', 'schedules:manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const services = await Service.find(withChurch(req.auth!.churchId))
        .select(SERVICE_LIST_FIELDS)
        .sort({ date: 1, time: 1, createdAt: 1 })
        .limit(20);
      const schedules = await ServiceSchedule.find(withChurch(req.auth!.churchId, {
        serviceId: { $in: services.map((service) => service._id) },
      }));
      const schedulesByService = new Map(schedules.map((schedule) => [String(schedule.serviceId), schedule]));
      return sendPrivateJson(res, {
        services: services.map((service) => serializeService(service)),
        schedules: services.map((service) => serializeSchedule(
          schedulesByService.get(String(service._id)) ?? {
            _id: '',
            serviceId: service._id,
            teams: [],
          }
        )),
      });
    } catch {
      return res.status(500).json({ error: 'Erro ao buscar visão geral das escalas' });
    }
  }
);

export default router;
