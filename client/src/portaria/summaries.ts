import { RELATIONSHIP_LABELS, VEHICLE_NOTICE_ACTION_LABELS } from '../types';
import type { QueueItemType, VehiclePayload, VisitorsPayload } from './types';

export function visitorsSummary(payload: VisitorsPayload): string {
  const names = payload.visitors.map((person) => person.name).filter(Boolean);
  if (names.length === 0) return 'Visitantes';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} e ${names[1]}`;
  return `${names[0]} e mais ${names.length - 1}`;
}

export function visitorsDetail(payload: VisitorsPayload): string {
  const first = payload.visitors[0];
  const city = first?.city || '';
  const relations = payload.visitors
    .map((person) => RELATIONSHIP_LABELS[person.relationship] || person.relationship)
    .filter((value, index, list) => list.indexOf(value) === index);
  return [city, relations.join(', ')].filter(Boolean).join(' · ');
}

export function vehicleSummary(payload: VehiclePayload): string {
  return [payload.plate, payload.vehicleModel].filter(Boolean).join(' · ') || 'Aviso de veículo';
}

export function vehicleDetail(payload: VehiclePayload): string {
  return VEHICLE_NOTICE_ACTION_LABELS[payload.requestedAction] || 'Aviso de veículo';
}

export function typeLabel(type: QueueItemType, count = 1): string {
  if (type === 'vehicle_notice') return 'Aviso de veículo';
  return count > 1 ? 'Visitantes' : 'Visitante';
}

export function statusLabel(status: string): string {
  if (status === 'queued') return 'Aguardando envio';
  if (status === 'syncing') return 'Enviando';
  if (status === 'sent') return 'Enviado';
  if (status === 'review') return 'Precisa ser revisado';
  if (status === 'blocked') return 'Acesso indisponível';
  return status;
}
