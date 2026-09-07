import type {
  AuthUser,
  ChurchProfile,
  CreatePrayerDto,
  CreateServiceDto,
  CreateServiceResponse,
  CreateVehicleNoticeDto,
  CreateVisitorDto,
  GuestAccess,
  GuestAccessType,
  HolyricsLocalToken,
  HolyricsSettings,
  HolyricsSyncResponse,
  PrayerRequest,
  PrayerRequestPanelItem,
  PublicInvitation,
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
  VehicleNoticeStats,
  VehicleNoticeStatus,
  VehiclePanelNotice,
  Visitor,
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

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Erro na requisição');
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

export const api = {
  async register(data: {
    churchName: string;
    name: string;
    email: string;
    username: string;
    password: string;
  }): Promise<AuthResponse> {
    const response = await apiFetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<AuthResponse>(response);
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
    requestId?: string
  ): Promise<{ success: true; message: string }> {
    const response = await apiFetch(
      `${API_BASE}/public-access/${encodeURIComponent(token)}/visitors`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitors, requestId }),
      }
    );
    return handleResponse(response);
  },

  async submitPublicPrayer(
    token: string,
    data: Pick<CreatePrayerDto, 'name' | 'request' | 'isAnonymous' | 'allowProjection'> & {
      requestId?: string;
    }
  ): Promise<{ success: true; message: string }> {
    const response = await apiFetch(
      `${API_BASE}/public-access/${encodeURIComponent(token)}/prayer-requests`,
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
};
