import { PrayerRequest } from '../models/PrayerRequest.js';
import { Service } from '../models/Service.js';
import { VehicleNotice } from '../models/VehicleNotice.js';
import { Visitor } from '../models/Visitor.js';
import { endOfDay, startOfDay } from '../utils/dayRange.js';
import { withChurch } from '../utils/tenant.js';
import {
  serializeVehiclePanelNotice,
  type VehiclePanelNotice,
} from '../utils/vehicleNoticePanel.js';

/**
 * Consultas dos painéis de TV. Painel com login e painel por link de leitura
 * passam pelos mesmos recortes, senão os dois divergem no que vai à projeção.
 * Nada aqui devolve quem registrou, telefone, parentesco ou observação interna.
 */

export interface VisitorPanelItem {
  _id: string;
  name: string;
  city: string;
  visitDate: Date;
  createdAt: Date;
}

export interface PrayerPanelItem {
  _id: string;
  name: string;
  request: string;
  isAnonymous: boolean;
  createdAt: Date;
}

export interface HymnPanelItem {
  title: string;
  artist: string;
  performedBy: string;
}

export interface ServicePanelItem {
  _id: string;
  title: string;
  time: string;
  hymns: HymnPanelItem[];
}

export async function fetchVisitorPanel(
  churchId: string,
  date: Date
): Promise<VisitorPanelItem[]> {
  const visitors = await Visitor.find(
    withChurch(churchId, {
      visitDate: { $gte: startOfDay(date), $lte: endOfDay(date) },
    })
  )
    .select('name city visitDate createdAt')
    .sort({ createdAt: -1 });

  return visitors.map((visitor) => ({
    _id: String(visitor._id),
    name: visitor.name,
    city: visitor.city,
    visitDate: visitor.visitDate,
    createdAt: visitor.createdAt,
  }));
}

/** Primeiro nome apenas: o telão não precisa identificar a pessoa inteira. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

export async function fetchPrayerPanel(
  churchId: string,
  date: Date
): Promise<PrayerPanelItem[]> {
  const requests = await PrayerRequest.find(
    withChurch(churchId, {
      allowProjection: true,
      createdAt: { $gte: startOfDay(date), $lte: endOfDay(date) },
    })
  )
    .select('name request isAnonymous createdAt')
    .sort({ createdAt: -1 });

  return requests.map((item) => ({
    _id: String(item._id),
    name: item.isAnonymous ? '' : firstName(item.name),
    request: item.request,
    isAnonymous: item.isAnonymous,
    createdAt: item.createdAt,
  }));
}

export async function fetchHymnPanel(
  churchId: string,
  date: Date
): Promise<ServicePanelItem[]> {
  const services = await Service.find(
    withChurch(churchId, {
      date: { $gte: startOfDay(date), $lte: endOfDay(date) },
    })
  )
    .select('title time hymns.title hymns.artist hymns.performedBy')
    .sort({ date: 1, time: 1 });

  return services.map((service) => ({
    _id: String(service._id),
    title: service.title,
    time: service.time ?? '',
    hymns: service.hymns.map((hymn) => ({
      title: hymn.title,
      artist: hymn.artist,
      performedBy: hymn.performedBy,
    })),
  }));
}

export async function fetchVehicleNoticePanel(
  churchId: string
): Promise<VehiclePanelNotice[]> {
  const notices = await VehicleNotice.find(
    withChurch(churchId, {
      archived: false,
      status: { $in: ['pending', 'announced'] },
    })
  )
    .select('plate vehicleModel requestedAction otherDescription')
    .sort({ createdAt: -1 });

  return notices.map(serializeVehiclePanelNotice);
}
