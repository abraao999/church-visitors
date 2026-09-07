import { PrayerRequest } from '../models/PrayerRequest.js';
import { VehicleNotice } from '../models/VehicleNotice.js';
import { Visitor } from '../models/Visitor.js';
import { resolveActiveService } from './activeService.js';
import { withChurch } from '../utils/tenant.js';
import {
  serializeVehiclePanelNotice,
  type VehiclePanelNotice,
} from '../utils/vehicleNoticePanel.js';

/**
 * Consultas dos painéis de TV. Painel com login e painel por link de leitura
 * passam pelos mesmos recortes, senão os dois divergem no que vai à projeção.
 * Nada aqui devolve quem registrou, telefone, parentesco ou observação interna.
 *
 * Com culto ativo: só registros daquela ocorrência.
 * Sem culto ativo: estado vazio amigável — não mistura o dia civil inteiro.
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
  _date: Date
): Promise<VisitorPanelItem[]> {
  const active = await resolveActiveService(churchId);
  if (!active) return [];

  const visitors = await Visitor.find(withChurch(churchId, { serviceId: active._id }))
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
  _date: Date
): Promise<PrayerPanelItem[]> {
  const active = await resolveActiveService(churchId);
  if (!active) return [];

  const requests = await PrayerRequest.find(
    withChurch(churchId, {
      allowProjection: true,
      serviceId: active._id,
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
  _date: Date
): Promise<ServicePanelItem[]> {
  const active = await resolveActiveService(churchId);
  if (!active) return [];

  return [
    {
      _id: String(active._id),
      title: active.title,
      time: active.time ?? '',
      hymns: active.hymns.map((hymn) => ({
        title: hymn.title,
        artist: hymn.artist,
        performedBy: hymn.performedBy,
      })),
    },
  ];
}

export async function fetchVehicleNoticePanel(
  churchId: string
): Promise<VehiclePanelNotice[]> {
  const active = await resolveActiveService(churchId);
  if (!active) return [];

  const notices = await VehicleNotice.find(
    withChurch(churchId, {
      archived: false,
      serviceId: active._id,
      status: { $in: ['pending', 'announced'] },
    })
  )
    .select('plate vehicleModel requestedAction otherDescription')
    .sort({ createdAt: -1 });

  return notices.map(serializeVehiclePanelNotice);
}
