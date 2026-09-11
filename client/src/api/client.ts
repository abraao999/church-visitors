import type {
  AuthUser,
  EmailConfirmationRequest,
  EmailConfirmationResponse,
  EmailResendResponse,
  PasswordForgotResponse,
  PasswordResetLinkStatus,
  PasswordResetRequest,
  PendingRegistrationResponse,
  ChurchBranding,
  ChurchProfile,
  CreatePrayerDto,
  CreateServiceDto,
  CreateServiceResponse,
  CreateVehicleNoticeDto,
  CreateVisitorDto,
  FollowUpAssignee,
  FollowUpContactRecord,
  FollowUpContactType,
  FollowUpDetail,
  FollowUpListResponse,
  FollowUpPreset,
  FollowUpStatus,
  FollowUpVisitorOption,
  GuestAccess,
  GuestAccessType,
  HolyricsLocalToken,
  HolyricsSettings,
  HolyricsSyncResponse,
  PortariaDevice,
  PortariaPairing,
  PrayerCareStatus,
  PrayerRequest,
  PrayerRequestPanelItem,
  ReportAccesses,
  ReportOverview,
  ReportPrayers,
  ReportPreset,
  ReportService,
  ReportVehicles,
  ReportVisitors,
  PublicInvitation,
  RetentionOverview,
  RetentionPolicy,
  ServicePanelItem,
  VisitorPanelItem,
  PublicAccessMetadata,
  ActiveServiceResponse,
  RecurrenceSeriesResponse,
  ServiceActivity,
  ServicePreview,
  Service,
  TeamInvitation,
  TeamMember,
  TeamOverview,
  TodayCount,
  UpdateServiceDto,
  VehicleNotice,
  VehicleNoticeAlerts,
  VehicleNoticeStats,
  VehicleNoticeStatus,
  VehiclePanelNotice,
  Visitor,
  WorshipPanelPayload,
} from '../types';

const API_BASE = '/api';
const LEGACY_TOKEN_KEY = 'church-visitors-token';

export function clearLegacyToken() {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, { ...init, credentials: 'include' });
  } catch {
    throw new Error('Não foi possível conectar. Confira a internet e tente de novo.');
  }
}

export class ApiError extends Error {
  readonly code?: string;
  readonly resendAvailableAt?: string;

  constructor(message: string, extras?: { code?: string; resendAvailableAt?: string }) {
    super(message);
    this.name = 'ApiError';
    this.code = extras?.code;
    this.resendAvailableAt = extras?.resendAvailableAt;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      resendAvailableAt?: string;
    };
    throw new ApiError(data.error || 'Erro na requisição', {
      code: typeof data.code === 'string' ? data.code : undefined,
      resendAvailableAt:
        typeof data.resendAvailableAt === 'string' ? data.resendAvailableAt : undefined,
    });
  }
  return response.json();
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...extra,
  };
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export interface AuthResponse {
  user: AuthUser;
}

export type ReportQuery = {
  preset?: ReportPreset;
  from?: string;
  to?: string;
  serviceId?: string;
  source?: 'all' | 'owner' | 'guest_access' | 'portaria_device';
};

function reportQuery(params: ReportQuery): string {
  const search = new URLSearchParams();
  if (params.preset) search.set('preset', params.preset);
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.serviceId) search.set('serviceId', params.serviceId);
  if (params.source && params.source !== 'all') search.set('source', params.source);
  return search.toString();
}

export const api = {
  async register(data: {
    churchName: string;
    name: string;
    email: string;
    username: string;
    password: string;
  }): Promise<PendingRegistrationResponse> {
    const response = await apiFetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<PendingRegistrationResponse>(response);
  },

  async confirmEmail(data: EmailConfirmationRequest): Promise<EmailConfirmationResponse> {
    const response = await apiFetch(`${API_BASE}/auth/email/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<EmailConfirmationResponse>(response);
  },

  async resendEmail(challengeId: string): Promise<EmailResendResponse> {
    const response = await apiFetch(`${API_BASE}/auth/email/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId }),
    });
    return handleResponse<EmailResendResponse>(response);
  },

  async forgotPassword(email: string): Promise<PasswordForgotResponse> {
    const response = await apiFetch(`${API_BASE}/auth/password/forgot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return handleResponse<PasswordForgotResponse>(response);
  },

  async inspectPasswordReset(token: string): Promise<{ status: PasswordResetLinkStatus }> {
    const response = await apiFetch(`${API_BASE}/auth/password/reset/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    return handleResponse<{ status: PasswordResetLinkStatus }>(response);
  },

  async resetPassword(data: PasswordResetRequest): Promise<{ ok: true }> {
    const response = await apiFetch(`${API_BASE}/auth/password/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<{ ok: true }>(response);
  },

  async login(data: { login: string; password: string }): Promise<AuthResponse> {
    const response = await apiFetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<AuthResponse>(response);
  },

  async me(): Promise<AuthUser> {
    const response = await apiFetch(`${API_BASE}/auth/me`, {
      headers: authHeaders(),
    });
    const data = await handleResponse<{ user: AuthUser }>(response);
    return data.user;
  },

  async logout(): Promise<void> {
    const response = await apiFetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    await handleResponse(response);
  },

  async changePassword(data: {
    currentPassword: string;
    newPassword: string;
  }): Promise<AuthResponse> {
    const response = await apiFetch(`${API_BASE}/auth/password`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<AuthResponse>(response);
  },

  async getVisitors(date?: string): Promise<Visitor[]> {
    const params = date ? `?date=${date}` : '';
    const response = await apiFetch(`${API_BASE}/visitors${params}`, {
      headers: authHeaders(),
    });
    return handleResponse<Visitor[]>(response);
  },

  async getVisitorStats(date?: string): Promise<TodayCount> {
    const params = date ? `?date=${date}` : '';
    const response = await apiFetch(`${API_BASE}/visitors/stats${params}`, {
      headers: authHeaders(),
    });
    return handleResponse<TodayCount>(response);
  },

  async createVisitor(data: CreateVisitorDto): Promise<Visitor | Visitor[]> {
    const response = await apiFetch(`${API_BASE}/visitors`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<Visitor | Visitor[]>(response);
  },

  async getFollowUps(params?: { q?: string; status?: string }): Promise<FollowUpListResponse> {
    const search = new URLSearchParams();
    if (params?.q) search.set('q', params.q);
    if (params?.status) search.set('status', params.status);
    const query = search.toString();
    const response = await apiFetch(`${API_BASE}/follow-up${query ? `?${query}` : ''}`, {
      headers: authHeaders(),
    });
    return handleResponse<FollowUpListResponse>(response);
  },

  async getFollowUpAssignees(): Promise<FollowUpAssignee[]> {
    const response = await apiFetch(`${API_BASE}/follow-up/assignees`, {
      headers: authHeaders(),
    });
    return handleResponse<FollowUpAssignee[]>(response);
  },

  async getAvailableFollowUpVisitors(q?: string): Promise<FollowUpVisitorOption[]> {
    const query = q ? `?q=${encodeURIComponent(q)}` : '';
    const response = await apiFetch(`${API_BASE}/follow-up/available-visitors${query}`, {
      headers: authHeaders(),
    });
    return handleResponse<FollowUpVisitorOption[]>(response);
  },

  async createFollowUp(data: {
    visitorId: string;
    phone?: string;
    assignedToId?: string;
    firstContact?: FollowUpPreset;
    firstContactDate?: string;
  }) {
    const response = await apiFetch(`${API_BASE}/follow-up`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async getFollowUp(id: string): Promise<FollowUpDetail> {
    const response = await apiFetch(`${API_BASE}/follow-up/${id}`, {
      headers: authHeaders(),
    });
    return handleResponse<FollowUpDetail>(response);
  },

  async updateFollowUp(id: string, data: { assignedToId?: string | null; status?: FollowUpStatus }) {
    const response = await apiFetch(`${API_BASE}/follow-up/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  async createFollowUpContact(
    id: string,
    data: {
      contactedAt: string;
      type: FollowUpContactType;
      result: string;
      note?: string;
      nextContactAt?: string;
      status: FollowUpStatus;
    }
  ): Promise<FollowUpContactRecord> {
    const response = await apiFetch(`${API_BASE}/follow-up/${id}/contacts`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<FollowUpContactRecord>(response);
  },

  async deleteVisitor(id: string): Promise<void> {
    const response = await apiFetch(`${API_BASE}/visitors/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await handleResponse(response);
  },

  async getPrayerRequests(date?: string): Promise<PrayerRequest[]> {
    const params = date ? `?date=${date}` : '';
    const response = await apiFetch(`${API_BASE}/prayer-requests${params}`, {
      headers: authHeaders(),
    });
    return handleResponse<PrayerRequest[]>(response);
  },

  async getPrayerRequestStats(date?: string): Promise<TodayCount> {
    const params = date ? `?date=${date}` : '';
    const response = await apiFetch(`${API_BASE}/prayer-requests/stats${params}`, {
      headers: authHeaders(),
    });
    return handleResponse<TodayCount>(response);
  },

  async getPrayerRequestsPanel(date?: string): Promise<PrayerRequestPanelItem[]> {
    const params = date ? `?date=${date}` : '';
    const response = await apiFetch(`${API_BASE}/prayer-requests/panel${params}`, {
      headers: authHeaders(),
      cache: 'no-store',
    });
    return handleResponse<PrayerRequestPanelItem[]>(response);
  },

  async getWorshipPanel(): Promise<WorshipPanelPayload> {
    const response = await apiFetch(`${API_BASE}/worship-panel`, {
      headers: authHeaders(),
      cache: 'no-store',
    });
    return handleResponse<WorshipPanelPayload>(response);
  },

  async getVisitorsPanel(date?: string): Promise<VisitorPanelItem[]> {
    const params = date ? `?date=${date}` : '';
    const response = await apiFetch(`${API_BASE}/visitors/panel${params}`, {
      headers: authHeaders(),
      cache: 'no-store',
    });
    return handleResponse<VisitorPanelItem[]>(response);
  },

  async getServicesPanel(date?: string): Promise<ServicePanelItem[]> {
    const params = date ? `?date=${date}` : '';
    const response = await apiFetch(`${API_BASE}/services/panel${params}`, {
      headers: authHeaders(),
      cache: 'no-store',
    });
    return handleResponse<ServicePanelItem[]>(response);
  },

  async createPrayerRequest(data: CreatePrayerDto): Promise<PrayerRequest> {
    const response = await apiFetch(`${API_BASE}/prayer-requests`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<PrayerRequest>(response);
  },

  async updatePrayerCareStatus(id: string, status: PrayerCareStatus): Promise<PrayerRequest> {
    const response = await apiFetch(`${API_BASE}/prayer-requests/${id}/care`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
    return handleResponse<PrayerRequest>(response);
  },

  async deletePrayerRequest(id: string): Promise<void> {
    const response = await apiFetch(`${API_BASE}/prayer-requests/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await handleResponse(response);
  },

  async getServices(params?: { date?: string; from?: string; to?: string }): Promise<Service[]> {
    const search = new URLSearchParams();
    if (params?.date) search.set('date', params.date);
    if (params?.from) search.set('from', params.from);
    if (params?.to) search.set('to', params.to);
    const query = search.toString();
    const response = await apiFetch(`${API_BASE}/services${query ? `?${query}` : ''}`, {
      headers: authHeaders(),
    });
    return handleResponse<Service[]>(response);
  },

  async createService(data: CreateServiceDto): Promise<CreateServiceResponse> {
    const response = await apiFetch(`${API_BASE}/services`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<CreateServiceResponse>(response);
  },

  async previewService(data: CreateServiceDto): Promise<ServicePreview> {
    const response = await apiFetch(`${API_BASE}/services/preview`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<ServicePreview>(response);
  },

  async getActiveService(): Promise<ActiveServiceResponse> {
    const response = await apiFetch(`${API_BASE}/services/active`, {
      headers: authHeaders(),
    });
    return handleResponse<ActiveServiceResponse>(response);
  },

  async getService(id: string): Promise<Service> {
    const response = await apiFetch(`${API_BASE}/services/${id}`, {
      headers: authHeaders(),
    });
    return handleResponse<Service>(response);
  },

  async getRecurrenceSeries(id: string): Promise<RecurrenceSeriesResponse> {
    const response = await apiFetch(`${API_BASE}/services/series/${id}`, {
      headers: authHeaders(),
    });
    return handleResponse<RecurrenceSeriesResponse>(response);
  },

  async getServiceActivity(id: string): Promise<ServiceActivity> {
    const response = await apiFetch(`${API_BASE}/services/${id}/activity`, {
      headers: authHeaders(),
    });
    return handleResponse<ServiceActivity>(response);
  },

  async openService(id: string): Promise<Service> {
    const response = await apiFetch(`${API_BASE}/services/${id}/open`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return handleResponse<Service>(response);
  },

  async closeService(id: string): Promise<Service> {
    const response = await apiFetch(`${API_BASE}/services/${id}/close`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return handleResponse<Service>(response);
  },

  async extendService(id: string, minutes: 30 | 60): Promise<Service> {
    const response = await apiFetch(`${API_BASE}/services/${id}/extend`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ minutes }),
    });
    return handleResponse<Service>(response);
  },

  async cancelServiceOccurrence(id: string): Promise<Service> {
    const response = await apiFetch(`${API_BASE}/services/${id}/cancel`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return handleResponse<Service>(response);
  },

  async updateService(id: string, data: UpdateServiceDto): Promise<Service> {
    const response = await apiFetch(`${API_BASE}/services/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<Service>(response);
  },

  async deleteService(id: string): Promise<void> {
    const response = await apiFetch(`${API_BASE}/services/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await handleResponse(response);
  },

  async getChurch(): Promise<ChurchProfile> {
    const response = await apiFetch(`${API_BASE}/church`, {
      headers: authHeaders(),
    });
    return handleResponse<ChurchProfile>(response);
  },

  async getTeam(params?: { q?: string; role?: string; status?: string }): Promise<TeamOverview> {
    const search = new URLSearchParams();
    if (params?.q) search.set('q', params.q);
    if (params?.role) search.set('role', params.role);
    if (params?.status) search.set('status', params.status);
    const query = search.toString();
    const response = await apiFetch(`${API_BASE}/team${query ? `?${query}` : ''}`, {
      headers: authHeaders(),
    });
    return handleResponse<TeamOverview>(response);
  },

  async createTeamInvitation(data: {
    name: string;
    email?: string;
    role: string;
    ttlDays: number;
    permissions?: string[];
    permissionsCustomized?: boolean;
  }): Promise<TeamInvitation> {
    const response = await apiFetch(`${API_BASE}/team/invitations`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<TeamInvitation>(response);
  },

  async cancelTeamInvitation(id: string): Promise<TeamInvitation> {
    const response = await apiFetch(`${API_BASE}/team/invitations/${id}/cancel`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<TeamInvitation>(response);
  },

  async renewTeamInvitation(id: string, ttlDays?: number): Promise<TeamInvitation> {
    const response = await apiFetch(`${API_BASE}/team/invitations/${id}/renew`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ttlDays }),
    });
    return handleResponse<TeamInvitation>(response);
  },

  async getTeamMember(id: string): Promise<TeamMember> {
    const response = await apiFetch(`${API_BASE}/team/members/${id}`, {
      headers: authHeaders(),
    });
    return handleResponse<TeamMember>(response);
  },

  async updateTeamMember(
    id: string,
    data: { role?: string; permissions?: string[]; permissionsCustomized?: boolean }
  ): Promise<TeamMember> {
    const response = await apiFetch(`${API_BASE}/team/members/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<TeamMember>(response);
  },

  async deactivateTeamMember(id: string): Promise<TeamMember> {
    const response = await apiFetch(`${API_BASE}/team/members/${id}/deactivate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<TeamMember>(response);
  },

  async reactivateTeamMember(id: string): Promise<TeamMember> {
    const response = await apiFetch(`${API_BASE}/team/members/${id}/reactivate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<TeamMember>(response);
  },

  async revokeTeamMemberSessions(id: string): Promise<void> {
    const response = await apiFetch(`${API_BASE}/team/members/${id}/revoke-sessions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    await handleResponse(response);
  },

  async getPublicInvitation(token: string): Promise<PublicInvitation> {
    const response = await apiFetch(`${API_BASE}/public-invitations/${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
    });
    return handleResponse<PublicInvitation>(response);
  },

  async acceptPublicInvitation(
    token: string,
    data: {
      name: string;
      email?: string;
      username?: string;
      password: string;
      confirmPassword: string;
    }
  ): Promise<AuthResponse> {
    const response = await apiFetch(
      `${API_BASE}/public-invitations/${encodeURIComponent(token)}/accept`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    return handleResponse<AuthResponse>(response);
  },

  async updateChurchVisitorFollowUp(enabled: boolean): Promise<ChurchProfile> {
    const response = await apiFetch(`${API_BASE}/church/visitor-follow-up`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ visitorFollowUpEnabled: enabled }),
    });
    return handleResponse<ChurchProfile>(response);
  },

  async updateChurch(data: {
    name: string;
    city?: string;
    phone?: string;
    address?: string;
  }): Promise<ChurchProfile> {
    const response = await apiFetch(`${API_BASE}/church`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<ChurchProfile>(response);
  },

  async getChurchBranding(): Promise<ChurchBranding> {
    const response = await apiFetch(`${API_BASE}/church/branding`, {
      headers: authHeaders(),
    });
    return handleResponse<ChurchBranding>(response);
  },

  async updateChurchBranding(data: {
    primaryColor?: string;
    accentColor?: string;
    restoreDefault?: boolean;
  }): Promise<ChurchBranding> {
    const response = await apiFetch(`${API_BASE}/church/branding`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<ChurchBranding>(response);
  },

  async uploadChurchLogo(file: File): Promise<ChurchBranding> {
    const body = new FormData();
    body.append('logo', file);
    const response = await apiFetch(`${API_BASE}/church/branding/logo`, {
      method: 'POST',
      body,
    });
    return handleResponse<ChurchBranding>(response);
  },

  async deleteChurchLogo(): Promise<ChurchBranding> {
    const response = await apiFetch(`${API_BASE}/church/branding/logo`, {
      method: 'DELETE',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<ChurchBranding>(response);
  },

  async getRetentionOverview(): Promise<RetentionOverview> {
    const response = await apiFetch(`${API_BASE}/retention`, {
      headers: authHeaders(),
      cache: 'no-store',
    });
    return handleResponse<RetentionOverview>(response);
  },

  async saveRetentionPolicy(
    data: Pick<
      RetentionPolicy,
      | 'enabled'
      | 'visitorsMonths'
      | 'prayersDays'
      | 'vehicleNoticesDays'
      | 'guestAccessesDays'
      | 'teamInvitationsDays'
      | 'portariaDevicesDays'
    >,
    confirmActivation = false
  ): Promise<RetentionOverview> {
    const response = await apiFetch(`${API_BASE}/retention`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ ...data, confirmActivation }),
    });
    return handleResponse<RetentionOverview>(response);
  },

  async runRetentionNow(): Promise<{
    message: string;
    overview: RetentionOverview;
  }> {
    const response = await apiFetch(`${API_BASE}/retention/run`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ confirmation: 'EXCLUIR DADOS VENCIDOS' }),
    });
    return handleResponse(response);
  },

  async getHolyricsSettings(): Promise<HolyricsSettings> {
    const response = await apiFetch(`${API_BASE}/holyrics/settings`, {
      headers: authHeaders(),
    });
    return handleResponse<HolyricsSettings>(response);
  },

  async saveHolyricsSettings(
    data: Pick<HolyricsSettings, 'mode' | 'host' | 'port'> & { token?: string; apiKey?: string }
  ): Promise<HolyricsSettings> {
    const response = await apiFetch(`${API_BASE}/holyrics/settings`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<HolyricsSettings>(response);
  },

  async getHolyricsLocalToken(): Promise<HolyricsLocalToken> {
    const response = await apiFetch(`${API_BASE}/holyrics/local-token`, {
      headers: authHeaders(),
    });
    return handleResponse<HolyricsLocalToken>(response);
  },

  async testHolyrics(): Promise<{ ok: boolean; message: string; songsCount?: number }> {
    const response = await apiFetch(`${API_BASE}/holyrics/test`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse(response);
  },

  async syncHolyrics(serviceId: string): Promise<HolyricsSyncResponse> {
    const response = await apiFetch(`${API_BASE}/holyrics/sync`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ serviceId }),
    });
    return handleResponse<HolyricsSyncResponse>(response);
  },

  async getGuestAccesses(): Promise<GuestAccess[]> {
    const response = await apiFetch(`${API_BASE}/guest-accesses`, {
      headers: authHeaders(),
    });
    return handleResponse<GuestAccess[]>(response);
  },

  async createGuestAccess(data: {
    name: string;
    type?: GuestAccessType;
    types?: GuestAccessType[];
    expiresAt?: string;
  }): Promise<GuestAccess> {
    const response = await apiFetch(`${API_BASE}/guest-accesses`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<GuestAccess>(response);
  },

  async updateGuestAccess(
    id: string,
    data: { name: string; expiresAt?: string; types?: GuestAccessType[] }
  ): Promise<GuestAccess> {
    const response = await apiFetch(`${API_BASE}/guest-accesses/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<GuestAccess>(response);
  },

  async deactivateGuestAccess(id: string): Promise<GuestAccess> {
    const response = await apiFetch(`${API_BASE}/guest-accesses/${id}/deactivate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<GuestAccess>(response);
  },

  async reactivateGuestAccess(id: string): Promise<GuestAccess> {
    const response = await apiFetch(`${API_BASE}/guest-accesses/${id}/reactivate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<GuestAccess>(response);
  },

  async renewGuestAccess(id: string): Promise<GuestAccess> {
    const response = await apiFetch(`${API_BASE}/guest-accesses/${id}/renew`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<GuestAccess>(response);
  },

  async getPortariaDevices(): Promise<PortariaDevice[]> {
    const response = await apiFetch(`${API_BASE}/portaria-devices`, {
      headers: authHeaders(),
    });
    return handleResponse<PortariaDevice[]>(response);
  },

  async createPortariaPairing(): Promise<PortariaPairing> {
    const response = await apiFetch(`${API_BASE}/portaria-devices/pairings`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<PortariaPairing>(response);
  },

  async renamePortariaDevice(id: string, name: string): Promise<PortariaDevice> {
    const response = await apiFetch(`${API_BASE}/portaria-devices/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ name }),
    });
    return handleResponse<PortariaDevice>(response);
  },

  async revokePortariaDevice(id: string): Promise<PortariaDevice> {
    const response = await apiFetch(`${API_BASE}/portaria-devices/${id}/revoke`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<PortariaDevice>(response);
  },

  async getPublicAccess(token: string): Promise<PublicAccessMetadata> {
    const response = await apiFetch(`${API_BASE}/public-access/${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
    });
    return handleResponse<PublicAccessMetadata>(response);
  },

  /** Painéis abertos por link de leitura, sem sessão de responsável. */
  async getPublicPanel<T>(token: string, panel: string, date?: string): Promise<T> {
    const params = date ? `?date=${date}` : '';
    const response = await apiFetch(
      `${API_BASE}/public-access/${encodeURIComponent(token)}/panels/${panel}${params}`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' }
    );
    return handleResponse<T>(response);
  },

  async submitPublicVisitors(
    token: string,
    visitors: CreateVisitorDto['visitors'],
    extras?: { requestId?: string; contactConsent?: boolean; phone?: string; channel?: 'qr' | 'shared_link' }
  ): Promise<{ success: true; message: string }> {
    const response = await apiFetch(
      `${API_BASE}/public-access/${encodeURIComponent(token)}/visitors${extras?.channel ? `?origem=${extras.channel === 'qr' ? 'qr' : 'link'}` : ''}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitors,
          requestId: extras?.requestId,
          ...(extras?.contactConsent ? { contactConsent: true, phone: extras.phone } : {}),
        }),
      }
    );
    return handleResponse(response);
  },

  async submitPublicPrayer(
    token: string,
    data: Pick<CreatePrayerDto, 'name' | 'request' | 'isAnonymous' | 'allowProjection'> & {
      requestId?: string;
      channel?: 'qr' | 'shared_link';
    }
  ): Promise<{ success: true; message: string }> {
    const response = await apiFetch(
      `${API_BASE}/public-access/${encodeURIComponent(token)}/prayer-requests${data.channel ? `?origem=${data.channel === 'qr' ? 'qr' : 'link'}` : ''}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    return handleResponse(response);
  },

  async submitPublicVehicleNotice(
    token: string,
    data: CreateVehicleNoticeDto
  ): Promise<{ success: true; message: string }> {
    const response = await apiFetch(
      `${API_BASE}/public-access/${encodeURIComponent(token)}/vehicle-notices`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    return handleResponse(response);
  },

  async getVehicleNotices(params?: {
    date?: string;
    status?: VehicleNoticeStatus | 'all';
    plate?: string;
  }): Promise<VehicleNotice[]> {
    const search = new URLSearchParams();
    if (params?.date) search.set('date', params.date);
    if (params?.status) search.set('status', params.status);
    if (params?.plate) search.set('plate', params.plate);
    const query = search.toString();
    const response = await apiFetch(`${API_BASE}/vehicle-notices${query ? `?${query}` : ''}`, {
      headers: authHeaders(),
    });
    return handleResponse<VehicleNotice[]>(response);
  },

  async getVehicleNoticesPanel(): Promise<VehiclePanelNotice[]> {
    const response = await apiFetch(`${API_BASE}/vehicle-notices/panel`, {
      headers: authHeaders(),
      cache: 'no-store',
    });
    return handleResponse<VehiclePanelNotice[]>(response);
  },

  async getVehicleNoticeAlerts(after?: string): Promise<VehicleNoticeAlerts> {
    const query = after ? `?after=${encodeURIComponent(after)}` : '';
    const response = await apiFetch(`${API_BASE}/vehicle-notices/alerts${query}`, {
      headers: authHeaders(),
      cache: 'no-store',
    });
    return handleResponse<VehicleNoticeAlerts>(response);
  },

  async getVehicleNoticeStats(date?: string): Promise<VehicleNoticeStats> {
    const params = date ? `?date=${date}` : '';
    const response = await apiFetch(`${API_BASE}/vehicle-notices/stats${params}`, {
      headers: authHeaders(),
    });
    return handleResponse<VehicleNoticeStats>(response);
  },

  async updateVehicleNoticeStatus(
    id: string,
    status: VehicleNoticeStatus,
    updatedAt: string
  ): Promise<VehicleNotice> {
    const response = await apiFetch(`${API_BASE}/vehicle-notices/${id}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status, updatedAt }),
    });
    return handleResponse<VehicleNotice>(response);
  },

  async getReportOverview(params: ReportQuery): Promise<ReportOverview> {
    return handleResponse(await apiFetch(`${API_BASE}/reports/overview?${reportQuery(params)}`, { headers: authHeaders() }));
  },

  async getReportVisitors(params: ReportQuery): Promise<ReportVisitors> {
    return handleResponse(await apiFetch(`${API_BASE}/reports/visitors?${reportQuery(params)}`, { headers: authHeaders() }));
  },

  async getReportPrayers(params: ReportQuery): Promise<ReportPrayers> {
    return handleResponse(await apiFetch(`${API_BASE}/reports/prayers?${reportQuery(params)}`, { headers: authHeaders() }));
  },

  async getReportVehicles(params: ReportQuery): Promise<ReportVehicles> {
    return handleResponse(await apiFetch(`${API_BASE}/reports/vehicles?${reportQuery(params)}`, { headers: authHeaders() }));
  },

  async getReportAccesses(params: ReportQuery): Promise<ReportAccesses> {
    return handleResponse(await apiFetch(`${API_BASE}/reports/accesses?${reportQuery(params)}`, { headers: authHeaders() }));
  },

  async getReportService(serviceId: string, params: ReportQuery): Promise<ReportService> {
    return handleResponse(
      await apiFetch(`${API_BASE}/reports/services/${encodeURIComponent(serviceId)}?${reportQuery(params)}`, {
        headers: authHeaders(),
      })
    );
  },

  async exportReport(data: ReportQuery & {
    format: 'pdf' | 'csv' | 'xlsx' | 'follow_up_list' | 'service';
    detailed?: boolean;
  }): Promise<{ blob: Blob; filename: string }> {
    const response = await apiFetch(`${API_BASE}/reports/exports`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Não foi possível exportar o relatório.');
    }
    const header = response.headers.get('Content-Disposition') || '';
    const filename = /filename="([^"]+)"/.exec(header)?.[1] || 'relatorio.bin';
    return { blob: await response.blob(), filename };
  },

  async recordPublicAccessEvent(
    token: string,
    data: { type: 'opened' | 'form_started' | 'submitted'; channel?: 'qr' | 'shared_link' }
  ): Promise<void> {
    await apiFetch(`${API_BASE}/public-access/${encodeURIComponent(token)}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  async archiveVehicleNotice(id: string): Promise<{ success: true; message: string }> {
    const response = await apiFetch(`${API_BASE}/vehicle-notices/${id}/archive`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return handleResponse<{ success: true; message: string }>(response);
  },
};
