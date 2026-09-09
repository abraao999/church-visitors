import { Church } from '../models/Church.js';
import { PrayerRequest } from '../models/PrayerRequest.js';
import { VehicleNotice } from '../models/VehicleNotice.js';
import { Visitor } from '../models/Visitor.js';
import { asSchedule, resolveActiveService } from './activeService.js';
import { publicChurchBranding } from '../utils/branding.js';
import {
  firstPublicName,
  PANEL_CITY_MAX,
  PANEL_NAME_MAX,
  PRAYER_PANEL_TEXT_MAX,
  sanitizePanelText,
} from '../utils/panelText.js';
import { churchTimezone, formatCivilDate, resolveServiceStatus } from '../utils/serviceSchedule.js';
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

const VISITOR_PANEL_FIELDS = 'name city visitDate createdAt';
const WORSHIP_VISITOR_FIELDS =
  'name city visitDate createdAt panelObservation showObservationOnPanel';
const PRAYER_PANEL_FIELDS = 'name request isAnonymous createdAt';
const WORSHIP_PRAYER_FIELDS = 'name request isAnonymous';
/** Mesma janela usada pelo painel de visitantes anterior para reconhecer um cadastro conjunto. */
const VISITOR_BATCH_WINDOW_MS = 2_500;

export async function loadWorshipChurch(churchId: string) {
  const church = await Church.findById(churchId).select(
    'name timezone branding.logoUrl branding.primaryColor branding.accentColor'
  );
  if (!church) return null;
  const timezone = churchTimezone(church.timezone);
  const branding = publicChurchBranding({
    name: church.name || 'Church Visitors',
    branding: church.branding,
  });
  return {
    timezone,
    church: {
      name: branding.name,
      ...(branding.logoUrl ? { logoUrl: branding.logoUrl } : {}),
      ...(branding.primaryColor ? { primaryColor: branding.primaryColor } : {}),
      ...(branding.accentColor ? { accentColor: branding.accentColor } : {}),
      timezone,
    } satisfies WorshipPanelChurch,
  };
}

export function serializeWorshipVisitor(visitor: {
  _id?: unknown;
  name?: string;
  city?: string;
  panelObservation?: string;
  showObservationOnPanel?: boolean;
}): WorshipPanelVisitorMember & { city?: string } {
  const name = sanitizePanelText(visitor.name ?? '', PANEL_NAME_MAX);
  const city = sanitizePanelText(visitor.city ?? '', PANEL_CITY_MAX);
  const observation =
    visitor.showObservationOnPanel === true
      ? sanitizePanelText(visitor.panelObservation ?? '', 80)
      : '';
  return {
    id: String(visitor._id),
    name,
    ...(city ? { city } : {}),
    ...(observation ? { panelObservation: observation } : {}),
  };
}

interface WorshipVisitorSource {
  _id?: unknown;
  name?: string;
  city?: string;
  visitDate?: Date | string;
  createdAt?: Date | string;
  panelObservation?: string;
  showObservationOnPanel?: boolean;
}

function visitorBatchStamp(visitor: WorshipVisitorSource): number {
  const value = visitor.visitDate ?? visitor.createdAt;
  if (!value) return Number.NaN;
  const stamp = new Date(value).getTime();
  return Number.isFinite(stamp) ? stamp : Number.NaN;
}

/**
 * Agrupa no servidor quem foi salvo junto, sem expor horário ou requestId no telão.
 * A cidade também precisa coincidir para cadastros próximos e independentes não se misturarem.
 */
export function serializeWorshipVisitorGroups(
  visitors: WorshipVisitorSource[]
): WorshipPanelVisitorGroup[] {
  const sorted = [...visitors].sort(
    (left, right) => visitorBatchStamp(right) - visitorBatchStamp(left)
  );
  const groups: Array<{
    id: string;
    city: string;
    cityKey: string;
    stamp: number;
    members: WorshipVisitorSource[];
  }> = [];

  for (const visitor of sorted) {
    const serialized = serializeWorshipVisitor(visitor);
    const city = serialized.city ?? '';
    const cityKey = city.toLocaleUpperCase('pt-BR');
    const stamp = visitorBatchStamp(visitor);
    const open = Number.isFinite(stamp)
      ? groups.find(
          (group) =>
            group.cityKey === cityKey && Math.abs(group.stamp - stamp) <= VISITOR_BATCH_WINDOW_MS
        )
      : undefined;

    if (open) {
      open.members.push(visitor);
      continue;
    }

    groups.push({
      id: serialized.id,
      city,
      cityKey,
      stamp,
      members: [visitor],
    });
  }

  return groups.map((group) => ({
    id: group.id,
    ...(group.city ? { city: group.city } : {}),
    members: group.members
      .sort((left, right) => visitorBatchStamp(left) - visitorBatchStamp(right))
      .map((visitor) => {
        const { id, name, panelObservation } = serializeWorshipVisitor(visitor);
        return {
          id,
          name,
          ...(panelObservation ? { panelObservation } : {}),
        };
      }),
  }));
}

export function serializeWorshipPrayer(item: {
  _id?: unknown;
  name?: string;
  request?: string;
  isAnonymous?: boolean;
}): WorshipPanelPrayer {
  const anonymous = item.isAnonymous === true;
  const firstName = anonymous ? '' : firstPublicName(item.name ?? '');
  return {
    id: String(item._id),
    text: sanitizePanelText(item.request ?? '', PRAYER_PANEL_TEXT_MAX),
    anonymous,
    ...(firstName ? { firstName } : {}),
  };
}

async function loadActiveWorshipVisitors(churchId: string, serviceId: unknown) {
  return Visitor.find(withChurch(churchId, { serviceId }))
    .select(WORSHIP_VISITOR_FIELDS)
    .sort({ createdAt: -1 });
}

async function loadActiveWorshipPrayers(churchId: string, serviceId: unknown) {
  return PrayerRequest.find(
    withChurch(churchId, {
      allowProjection: true,
      serviceId,
    })
  )
    .select(WORSHIP_PRAYER_FIELDS)
    .sort({ createdAt: -1 });
}

export async function fetchWorshipPanel(churchId: string): Promise<WorshipPanelPayload> {
  const loaded = await loadWorshipChurch(churchId);
  const church = loaded?.church ?? { name: 'Church Visitors', timezone: churchTimezone() };
  const timezone = loaded?.timezone ?? church.timezone;
  const updatedAt = new Date().toISOString();
  const active = await resolveActiveService(churchId, new Date(), timezone);

  if (!active) {
    return { church, service: null, visitors: [], prayers: [], updatedAt };
  }

  const [visitors, prayers] = await Promise.all([
    loadActiveWorshipVisitors(churchId, active._id),
    loadActiveWorshipPrayers(churchId, active._id),
  ]);

  return {
    church,
    service: {
      title: sanitizePanelText(active.title, 80),
      date: formatCivilDate(active.date instanceof Date ? active.date : new Date(active.date), timezone),
      status: resolveServiceStatus(asSchedule(active), new Date(), timezone),
    },
    visitors: serializeWorshipVisitorGroups(visitors),
    prayers: prayers.map(serializeWorshipPrayer),
    updatedAt,
  };
}

export async function fetchVisitorPanel(
  churchId: string,
  _date: Date
): Promise<VisitorPanelItem[]> {
  const active = await resolveActiveService(churchId);
  if (!active) return [];

  const visitors = await Visitor.find(withChurch(churchId, { serviceId: active._id }))
    .select(VISITOR_PANEL_FIELDS)
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
    .select(PRAYER_PANEL_FIELDS)
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
