export const RELATIONSHIPS = [
  { value: 'pai', label: 'Pai' },
  { value: 'mae', label: 'Mãe' },
  { value: 'filho', label: 'Filho' },
  { value: 'filha', label: 'Filha' },
  { value: 'avo', label: 'Avô' },
  { value: 'ava', label: 'Avó' },
  { value: 'neto', label: 'Neto' },
  { value: 'neta', label: 'Neta' },
  { value: 'esposo', label: 'Esposo' },
  { value: 'esposa', label: 'Esposa' },
  { value: 'irmao', label: 'Irmão' },
  { value: 'irma', label: 'Irmã' },
  { value: 'outro', label: 'Outro' },
] as const;

export type Relationship = (typeof RELATIONSHIPS)[number]['value'];

export const RELATIONSHIP_LABELS: Record<Relationship, string> = Object.fromEntries(
  RELATIONSHIPS.map((r) => [r.value, r.label])
) as Record<Relationship, string>;

export interface Actor {
  userId: string;
  churchId?: string;
  name: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  username?: string;
  churchName: string;
}

export interface ChurchProfile {
  id: string;
  name: string;
  slug: string;
  city: string;
  phone: string;
  address: string;
  active: boolean;
}

export type GuestAccessType =
  | 'visitors:create'
  | 'prayers:create'
  | 'vehicle_notices:create';

export interface GuestOrigin {
  guestAccessId: string;
  name: string;
  type: GuestAccessType;
}

export interface GuestAccess {
  id: string;
  name: string;
  type: GuestAccessType;
  types: GuestAccessType[];
  specific?: boolean;
  active: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
  token: string;
}

export interface PublicAccessMetadata {
  valid: true;
  churchName: string;
  accessName: string;
  type: GuestAccessType;
  types: GuestAccessType[];
}

export interface Visitor {
  _id: string;
  name: string;
  relationship: Relationship;
  city: string;
  visitDate: string;
  source?: 'owner' | 'guest_access';
  createdBy?: Actor;
  guestAccess?: GuestOrigin;
  createdAt: string;
}

export interface PrayerRequest {
  _id: string;
  name: string;
  request: string;
  source: 'owner' | 'guest_access' | 'porteiro' | 'live';
  isAnonymous: boolean;
  createdBy?: Actor;
  guestAccess?: GuestOrigin;
  createdAt: string;
}

export interface CreateVisitorDto {
  visitors: Array<{
    name: string;
    city: string;
    relationship?: Relationship;
  }>;
}

export interface CreatePrayerDto {
  name: string;
  request: string;
  source?: 'owner';
  isAnonymous: boolean;
}

export interface Hymn {
  title: string;
  artist: string;
  performedBy: string;
  addedBy?: Actor;
}

export interface Service {
  _id: string;
  title: string;
  date: string;
  time?: string;
  hymns: Hymn[];
  createdBy?: Actor;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServiceDto {
  title: string;
  date: string;
  time?: string;
  hymns?: Hymn[];
  recurring?: boolean;
}

export interface CreateServiceResponse {
  service: Service;
  createdCount: number;
}

export interface UpdateServiceDto {
  title: string;
  date: string;
  time?: string;
  hymns: Hymn[];
}

export type HolyricsMode = 'local' | 'internet';

export interface HolyricsSettings {
  mode: HolyricsMode;
  host: string;
  port: number;
  token: string;
  apiKey: string;
  hasToken: boolean;
  hasApiKey: boolean;
  updatedAt?: string;
}

export interface HolyricsSyncResultItem {
  title: string;
  artist: string;
  status: 'added' | 'not_found' | 'error';
  holyricsId?: string;
  holyricsTitle?: string;
  message?: string;
}

export interface HolyricsSyncResponse {
  serviceId: string;
  serviceTitle: string;
  added: number;
  notFound: number;
  errors: number;
  results: HolyricsSyncResultItem[];
  message: string;
}

export const VEHICLE_NOTICE_ACTIONS = [
  { value: 'remove_vehicle', label: 'Retirar o veículo' },
  { value: 'turn_off_lights', label: 'Apagar os faróis' },
  { value: 'close_door_or_window', label: 'Fechar porta ou janela' },
  { value: 'reposition_vehicle', label: 'Reposicionar o veículo' },
  { value: 'other', label: 'Outro aviso' },
] as const;

export type VehicleNoticeAction = (typeof VEHICLE_NOTICE_ACTIONS)[number]['value'];

export const VEHICLE_NOTICE_ACTION_LABELS: Record<VehicleNoticeAction, string> = Object.fromEntries(
  VEHICLE_NOTICE_ACTIONS.map((item) => [item.value, item.label])
) as Record<VehicleNoticeAction, string>;

export type VehicleNoticeStatus = 'pending' | 'announced' | 'resolved';

export interface VehicleNotice {
  id: string;
  plate: string;
  plateNormalized: string;
  vehicleModel: string;
  requestedAction: VehicleNoticeAction;
  otherDescription?: string;
  details: string;
  status: VehicleNoticeStatus;
  source: 'guest_access' | 'owner';
  guestAccessName?: string;
  announcedAt?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleNoticeStats {
  pending: number;
  announced: number;
  resolvedToday: number;
}

export interface VehiclePanelNotice {
  id: string;
  plate: string;
  vehicleModel: string;
  requestedAction: VehicleNoticeAction;
  instruction: string;
}

export interface CreateVehicleNoticeDto {
  plate: string;
  vehicleModel: string;
  requestedAction: VehicleNoticeAction;
  otherDescription?: string;
  details?: string;
  requestId?: string;
}

export function formatVisitor(visitor: Pick<Visitor, 'name' | 'relationship' | 'city'>): string {
  const parts = [visitor.name];
  if (visitor.city) parts.push(visitor.city);
  if (visitor.relationship && visitor.relationship !== 'outro') {
    parts.push(RELATIONSHIP_LABELS[visitor.relationship] ?? visitor.relationship);
  }
  return parts.join(' · ');
}
