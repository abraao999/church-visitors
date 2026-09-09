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

/** Nome de quem registrou. Ids internos não saem da API. */
export interface Actor {
  name: string;
}

export type TeamRole =
  | 'owner'
  | 'admin'
  | 'portaria'
  | 'intercession'
  | 'louvor'
  | 'midia';

export interface ChurchBranding {
  name: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  updatedAt?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  username?: string;
  churchName: string;
  role: TeamRole;
  permissions: string[];
  branding?: ChurchBranding;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  username?: string;
  role: TeamRole;
  roleLabel: string;
  permissions: string[];
  permissionsCustomized: boolean;
  active: boolean;
  lastSeenAt?: string;
  you: boolean;
  deactivatedAt?: string;
  permissionsUpdatedAt?: string;
  permissionsUpdatedByName?: string;
}

export interface TeamInvitation {
  id: string;
  name: string;
  email?: string;
  role: TeamRole;
  roleLabel: string;
  permissions: string[];
  permissionsCustomized: boolean;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
  expiresAt: string;
  createdAt: string;
  path?: string;
}

export interface TeamOverview {
  churchName: string;
  stats: { activeMembers: number; pendingInvites: number; roles: number };
  members: TeamMember[];
  invitations: TeamInvitation[];
}

export interface PublicInvitation {
  valid: true;
  churchName: string;
  name: string;
  email?: string;
  emailLocked: boolean;
  role: TeamRole;
  roleLabel: string;
  roleSummary: string;
  areas: string[];
  expiresAt: string;
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

export interface RetentionPolicy {
  enabled: boolean;
  visitorsMonths: number;
  prayersDays: number;
  vehicleNoticesDays: number;
  guestAccessesDays: number;
  teamInvitationsDays: number;
  portariaDevicesDays: number;
  activatedAt?: string;
  lastRunAt?: string;
  lastRunStatus?: 'completed' | 'failed';
  updatedAt?: string;
}

export interface RetentionSummary {
  visitorsAnonymized: number;
  prayersDeleted: number;
  vehicleNoticesDeleted: number;
  guestAccessesDeleted: number;
  teamInvitationsDeleted: number;
  portariaDevicesDeleted: number;
}

export interface RetentionPreview {
  generatedAt: string;
  cutoffs: {
    visitors: string;
    prayers: string;
    vehicleNotices: string;
    guestAccesses: string;
    teamInvitations: string;
    portariaDevices: string;
  };
  counts: RetentionSummary;
}

export interface RetentionRun {
  id: string;
  trigger: 'automatic' | 'owner';
  status: 'completed' | 'failed';
  summary: RetentionSummary;
  startedAt: string;
  completedAt: string;
}

export interface RetentionOverview {
  policy: RetentionPolicy;
  preview: RetentionPreview;
  history: RetentionRun[];
}

export type GuestAccessType =
  | 'visitors:create'
  | 'prayers:create'
  | 'vehicle_notices:create'
  | 'panels:read';

/** Nome do acesso que originou o registro. Sem o id interno do link. */
export interface GuestOrigin {
  name: string;
}

export type PortariaOfflinePermission =
  | 'offline_visitors:create'
  | 'offline_vehicle_notices:create';

export interface PortariaDevice {
  id: string;
  name: string;
  publicId: string;
  permissions: PortariaOfflinePermission[];
  active: boolean;
  lastUsedAt?: string;
  createdAt: string;
  revokedAt?: string;
}

export interface PortariaPairing {
  id: string;
  token: string;
  expiresAt: string;
  url: string;
}

export interface PortariaDeviceSession {
  valid: true;
  churchName: string;
  deviceName: string;
  publicId: string;
  permissions: PortariaOfflinePermission[];
  serverTime: string;
}

export interface PortariaClaimResult {
  churchName: string;
  deviceName: string;
  publicId: string;
  permissions: PortariaOfflinePermission[];
  serverTime: string;
  credential: string;
}

export interface GuestAccess {
  id: string;
  name: string;
  type: GuestAccessType;
  types: GuestAccessType[];
  /** Acesso de leitura para as TVs, em vez de formulário de visitante. */
  panel?: boolean;
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
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
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
  serviceId?: string;
  panelObservation?: string;
  showObservationOnPanel?: boolean;
  createdAt: string;
}

export interface PrayerRequest {
  _id: string;
  name: string;
  request: string;
  source: 'owner' | 'guest_access' | 'porteiro' | 'live';
  isAnonymous: boolean;
  allowProjection: boolean;
  createdBy?: Actor;
  guestAccess?: GuestOrigin;
  serviceId?: string;
  createdAt: string;
}

export interface CreateVisitorDto {
  visitors: Array<{
    name: string;
    city: string;
    relationship?: Relationship;
    panelObservation?: string;
    showObservationOnPanel?: boolean;
  }>;
  serviceId?: string;
}

export interface CreatePrayerDto {
  name: string;
  request: string;
  source?: 'owner';
  isAnonymous: boolean;
  allowProjection?: boolean;
  serviceId?: string;
}

/** Recorte enviado ao painel de TV: sem nome completo e sem quem registrou. */
export interface PrayerRequestPanelItem {
  _id: string;
  name: string;
  request: string;
  isAnonymous: boolean;
  createdAt: string;
}

/** Recorte do painel de visitantes: sem parentesco e sem quem registrou. */
export interface VisitorPanelItem {
  _id: string;
  name: string;
  city: string;
  visitDate: string;
  createdAt: string;
}

export interface WorshipPanelChurch {
  name: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  timezone: string;
}

export interface WorshipPanelService {
  title: string;
  date: string;
  status: string;
}

export interface WorshipPanelVisitorMember {
  id: string;
  name: string;
  panelObservation?: string;
}

export interface WorshipPanelVisitorGroup {
  id: string;
  city?: string;
  members: WorshipPanelVisitorMember[];
}

export interface WorshipPanelPrayer {
  id: string;
  text: string;
  firstName?: string;
  anonymous: boolean;
}

export interface WorshipPanelPayload {
  church: WorshipPanelChurch;
  service: WorshipPanelService | null;
  visitors: WorshipPanelVisitorGroup[];
  prayers: WorshipPanelPrayer[];
  updatedAt: string;
}

export interface ServicePanelItem {
  _id: string;
  title: string;
  time: string;
  hymns: Array<{ title: string; artist: string; performedBy: string }>;
}

export interface Hymn {
  title: string;
  artist: string;
  performedBy: string;
  addedBy?: Actor;
}

export type ServiceStatus =
  | 'scheduled'
  | 'reception_open'
  | 'in_progress'
  | 'closed'
  | 'cancelled';

export type RecurrenceFrequency = 'weekly' | 'biweekly';

export interface Service {
  _id: string;
  title: string;
  date: string;
  dateKey?: string;
  time?: string;
  hymns: Hymn[];
  createdBy?: Actor;
  createdAt: string;
  updatedAt: string;
  recurrenceSeriesId?: string;
  scheduledStartAt?: string;
  receptionStartsAt?: string;
  endsAt?: string;
  plannedEndsAt?: string;
  durationMinutes?: number;
  activationLeadMinutes?: number;
  cancelledAt?: string;
  closedAt?: string;
  extendedUntil?: string;
  openedAt?: string;
  autoOpenedAt?: string;
  status?: ServiceStatus;
  statusLabel?: string;
  now?: string;
  series?: RecurrenceSeries | null;
  counts?: {
    visitors: number;
    prayers: number;
    pendingNotices: number;
    hymns: number;
  };
}

export interface RecurrenceSeries {
  id: string;
  title: string;
  frequency: RecurrenceFrequency;
  frequencyLabel: string;
  weekday: number;
  startDate: string;
  endDate: string;
  time: string;
  durationMinutes: number;
  activationLeadMinutes: number;
  active: boolean;
  occurrenceCount?: number;
}

export interface ServicePreview {
  firstOccurrenceLabel?: string;
  receptionTime?: string;
  startTime?: string;
  endTime?: string;
  repeatLabel?: string;
  count?: number;
  error?: string;
}

export interface CreateServiceDto {
  title: string;
  date: string;
  time?: string;
  durationMinutes?: number;
  hymns?: Hymn[];
  recurring?: boolean;
  frequency?: RecurrenceFrequency;
  weekday?: number;
  endDate?: string;
  requestId?: string;
}

export interface CreateServiceResponse {
  service: Service;
  createdCount: number;
  seriesId?: string;
}

export interface UpdateServiceDto {
  title: string;
  date: string;
  time?: string;
  durationMinutes?: number;
  hymns: Hymn[];
  updatedAt: string;
  editScope?: 'this' | 'thisAndFuture';
}

export interface ActiveServiceResponse {
  now: string;
  service: Service | null;
}

export interface RecurrenceSeriesResponse {
  now: string;
  series: RecurrenceSeries;
  occurrences: Service[];
}

export interface ServiceActivity {
  visitors: Visitor[];
  prayers: PrayerRequest[];
  notices: Array<{
    id: string;
    plate: string;
    requestedAction: string;
    status: string;
    createdAt: string;
  }>;
}

export type HolyricsMode = 'local' | 'internet';

export interface HolyricsSettings {
  mode: HolyricsMode;
  host: string;
  port: number;
  hasToken: boolean;
  hasApiKey: boolean;
  updatedAt?: string;
}

/** Token do modo local, buscado só na hora do sync pelo navegador. */
export interface HolyricsLocalToken {
  host: string;
  port: number;
  token: string;
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

export interface TodayCount {
  count: number;
}

export interface VehicleNoticeStats {
  pending: number;
  announced: number;
  resolvedToday: number;
}

export interface VehicleNoticeAlert {
  id: string;
  plate: string;
  vehicleModel: string;
  requestedAction: VehicleNoticeAction;
  otherDescription?: string;
  status: VehicleNoticeStatus;
  createdAt: string;
  updatedAt: string;
  serviceId?: string;
}

export interface VehicleNoticeAlerts {
  notices: VehicleNoticeAlert[];
  pendingCount: number;
  nextCursor: string;
  serverTime: string;
  operationalService: boolean;
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
