import mongoose, { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { PrayerRequest } from '../models/PrayerRequest.js';
import { Service } from '../models/Service.js';
import { VehicleNotice } from '../models/VehicleNotice.js';
import { Visitor } from '../models/Visitor.js';
import { VisitorFollowUp } from '../models/VisitorFollowUp.js';
import type { IActor } from '../models/Actor.js';

export type TrainingSeedKind = 'visitors' | 'prayers' | 'vehicle' | 'service';

export interface TrainingSummary {
  visitors: number;
  prayers: number;
  vehicleNotices: number;
  services: number;
  followUps: number;
}

export interface TrainingOverview {
  enabled: boolean;
  summary: TrainingSummary;
}

function todayAt(hour: number, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

export async function trainingModeEnabled(churchId: string): Promise<boolean> {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    const church = await Church.findById(churchId).select('trainingModeEnabled active');
    return Boolean(church?.active && church.trainingModeEnabled === true);
  } catch {
    return false;
  }
}

export async function getTrainingSummary(churchId: string): Promise<TrainingSummary> {
  const filter = { churchId: new Types.ObjectId(churchId), isTraining: true };
  const [visitors, prayers, vehicleNotices, services, followUps] = await Promise.all([
    Visitor.countDocuments(filter),
    PrayerRequest.countDocuments(filter),
    VehicleNotice.countDocuments(filter),
    Service.countDocuments(filter),
    VisitorFollowUp.countDocuments(filter),
  ]);
  return { visitors, prayers, vehicleNotices, services, followUps };
}

export async function getTrainingOverview(churchId: string): Promise<TrainingOverview> {
  const church = await Church.findById(churchId).select('trainingModeEnabled active');
  return {
    enabled: Boolean(church?.active && church.trainingModeEnabled === true),
    summary: await getTrainingSummary(churchId),
  };
}

export async function setTrainingMode(churchId: string, enabled: boolean) {
  await Church.findByIdAndUpdate(churchId, { $set: { trainingModeEnabled: enabled } });
  return getTrainingOverview(churchId);
}

async function ensureTrainingService(churchId: string, actor: IActor) {
  const existing = await Service.findOne({
    churchId,
    isTraining: true,
    title: 'Culto de treinamento',
  }).sort({ createdAt: -1 });
  if (existing) return existing;
  const date = todayAt(19, 30);
  return Service.create({
    churchId,
    title: 'Culto de treinamento',
    date,
    time: '19:30',
    scheduledStartAt: date,
    durationMinutes: 90,
    activationLeadMinutes: 30,
    openedAt: new Date(),
    hymns: [
      { title: 'Grande é o Senhor', artist: 'Ministério de teste', performedBy: 'Equipe de louvor', addedBy: actor },
      { title: 'Bondade de Deus', artist: 'Canção de teste', performedBy: 'Vocal teste', addedBy: actor },
    ],
    createdBy: actor,
    isTraining: true,
  });
}

export async function seedTrainingData(churchId: string, actor: IActor, kind: TrainingSeedKind) {
  const service = await ensureTrainingService(churchId, actor);
  if (kind === 'service') return getTrainingOverview(churchId);

  if (kind === 'visitors') {
    const created = await Visitor.insertMany([
      {
        churchId,
        name: 'Maria de Teste',
        relationship: 'outro',
        city: 'Umuarama',
        visitDate: new Date(),
        source: 'owner',
        createdBy: actor,
        serviceId: service._id,
        panelObservation: 'Primeira visita simulada',
        showObservationOnPanel: true,
        visitKind: 'first',
        isTraining: true,
      },
      {
        churchId,
        name: 'João de Teste',
        relationship: 'outro',
        city: 'Umuarama',
        visitDate: new Date(),
        source: 'owner',
        createdBy: actor,
        serviceId: service._id,
        visitKind: 'first',
        isTraining: true,
      },
    ]);
    await VisitorFollowUp.create({
      churchId,
      visitorId: created[0]._id,
      phone: '44999999999',
      status: 'awaiting',
      nextContactAt: new Date(),
      consent: true,
      source: 'owner',
      createdBy: actor,
      updatedBy: actor,
      isTraining: true,
    });
  }

  if (kind === 'prayers') {
    await PrayerRequest.insertMany([
      {
        churchId,
        name: 'Ana Teste',
        request: 'Pedido de oração criado para treinamento da equipe.',
        source: 'owner',
        isAnonymous: false,
        allowProjection: true,
        createdBy: actor,
        serviceId: service._id,
        careStatus: 'new',
        isTraining: true,
      },
      {
        churchId,
        name: '',
        request: 'Pedido anônimo de exemplo para testar o telão.',
        source: 'owner',
        isAnonymous: true,
        allowProjection: false,
        createdBy: actor,
        serviceId: service._id,
        careStatus: 'new',
        isTraining: true,
      },
    ]);
  }

  if (kind === 'vehicle') {
    await VehicleNotice.create({
      churchId,
      plate: 'ABC1D23',
      plateNormalized: 'ABC1D23',
      vehicleModel: 'Carro de teste',
      requestedAction: 'remove_vehicle',
      details: 'Aviso criado para simular chamada no culto.',
      status: 'pending',
      source: 'owner',
      createdBy: actor,
      archived: false,
      serviceId: service._id,
      isTraining: true,
    });
  }

  return getTrainingOverview(churchId);
}

export async function clearTrainingData(churchId: string): Promise<TrainingOverview> {
  const filter = { churchId: new Types.ObjectId(churchId), isTraining: true };
  await Promise.all([
    VisitorFollowUp.deleteMany(filter),
    Visitor.deleteMany(filter),
    PrayerRequest.deleteMany(filter),
    VehicleNotice.deleteMany(filter),
    Service.deleteMany(filter),
  ]);
  return getTrainingOverview(churchId);
}
