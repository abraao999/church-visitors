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
  HolyricsSettings,
  HolyricsSyncResponse,
  PrayerRequest,
  PublicAccessMetadata,
  Service,
  UpdateServiceDto,
  VehicleNotice,
  VehicleNoticeStats,
  VehicleNoticeStatus,
  Visitor,
} from '../types';

const API_BASE = '/api';
const TOKEN_KEY = 'church-visitors-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Erro na requisição');
  }
  return response.json();
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export interface AuthResponse {
  token: string;
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
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<AuthResponse>(response);
  },

  async login(data: { login: string; password: string }): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<AuthResponse>(response);
  },

  async me(): Promise<AuthUser> {
    const response = await fetch(`${API_BASE}/auth/me`, {
      headers: authHeaders(),
    });
    const data = await handleResponse<{ user: AuthUser }>(response);
    return data.user;
  },

  async getVisitors(date?: string): Promise<Visitor[]> {
    const params = date ? `?date=${date}` : '';
    const response = await fetch(`${API_BASE}/visitors${params}`, {
      headers: authHeaders(),
    });
    return handleResponse<Visitor[]>(response);
  },

  async createVisitor(data: CreateVisitorDto): Promise<Visitor | Visitor[]> {
    const response = await fetch(`${API_BASE}/visitors`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<Visitor | Visitor[]>(response);
  },

  async deleteVisitor(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/visitors/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await handleResponse(response);
  },

  async getPrayerRequests(date?: string): Promise<PrayerRequest[]> {
    const params = date ? `?date=${date}` : '';
    const response = await fetch(`${API_BASE}/prayer-requests${params}`, {
      headers: authHeaders(),
    });
    return handleResponse<PrayerRequest[]>(response);
  },

  async createPrayerRequest(data: CreatePrayerDto): Promise<PrayerRequest> {
    const response = await fetch(`${API_BASE}/prayer-requests`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<PrayerRequest>(response);
  },

  async deletePrayerRequest(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/prayer-requests/${id}`, {
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
    const response = await fetch(`${API_BASE}/services${query ? `?${query}` : ''}`, {
      headers: authHeaders(),
    });
    return handleResponse<Service[]>(response);
  },

  async createService(data: CreateServiceDto): Promise<CreateServiceResponse> {
    const response = await fetch(`${API_BASE}/services`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<CreateServiceResponse>(response);
  },

  async updateService(id: string, data: UpdateServiceDto): Promise<Service> {
    const response = await fetch(`${API_BASE}/services/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<Service>(response);
  },

  async deleteService(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/services/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await handleResponse(response);
  },

  async getChurch(): Promise<ChurchProfile> {
    const response = await fetch(`${API_BASE}/church`, {
      headers: authHeaders(),
    });
    return handleResponse<ChurchProfile>(response);
  },

  async updateChurch(data: {
    name: string;
    city?: string;
    phone?: string;
    address?: string;
  }): Promise<ChurchProfile> {
    const response = await fetch(`${API_BASE}/church`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<ChurchProfile>(response);
  },

  async getHolyricsSettings(): Promise<HolyricsSettings> {
    const response = await fetch(`${API_BASE}/holyrics/settings`, {
      headers: authHeaders(),
    });
    return handleResponse<HolyricsSettings>(response);
  },

  async saveHolyricsSettings(
    data: Pick<HolyricsSettings, 'mode' | 'host' | 'port' | 'token' | 'apiKey'>
  ): Promise<HolyricsSettings> {
    const response = await fetch(`${API_BASE}/holyrics/settings`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<HolyricsSettings>(response);
  },

  async testHolyrics(): Promise<{ ok: boolean; message: string; songsCount?: number }> {
    const response = await fetch(`${API_BASE}/holyrics/test`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse(response);
  },

  async syncHolyrics(serviceId: string): Promise<HolyricsSyncResponse> {
    const response = await fetch(`${API_BASE}/holyrics/sync`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ serviceId }),
    });
    return handleResponse<HolyricsSyncResponse>(response);
  },

  async getGuestAccesses(): Promise<GuestAccess[]> {
    const response = await fetch(`${API_BASE}/guest-accesses`, {
      headers: authHeaders(),
    });
    return handleResponse<GuestAccess[]>(response);
  },

  async createGuestAccess(data: {
    name: string;
    type: GuestAccessType;
    expiresAt?: string;
  }): Promise<GuestAccess> {
    const response = await fetch(`${API_BASE}/guest-accesses`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<GuestAccess>(response);
  },

  async updateGuestAccess(
    id: string,
    data: { name: string; expiresAt?: string }
  ): Promise<GuestAccess> {
    const response = await fetch(`${API_BASE}/guest-accesses/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<GuestAccess>(response);
  },

  async deactivateGuestAccess(id: string): Promise<GuestAccess> {
    const response = await fetch(`${API_BASE}/guest-accesses/${id}/deactivate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<GuestAccess>(response);
  },

  async reactivateGuestAccess(id: string): Promise<GuestAccess> {
    const response = await fetch(`${API_BASE}/guest-accesses/${id}/reactivate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<GuestAccess>(response);
  },

  async renewGuestAccess(id: string): Promise<GuestAccess> {
    const response = await fetch(`${API_BASE}/guest-accesses/${id}/renew`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    return handleResponse<GuestAccess>(response);
  },

  async getPublicAccess(token: string): Promise<PublicAccessMetadata> {
    const response = await fetch(`${API_BASE}/public-access/${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
    });
    return handleResponse<PublicAccessMetadata>(response);
  },

  async submitPublicVisitors(
    token: string,
    visitors: CreateVisitorDto['visitors']
  ): Promise<{ success: true; message: string }> {
    const response = await fetch(
      `${API_BASE}/public-access/${encodeURIComponent(token)}/visitors`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitors }),
      }
    );
    return handleResponse(response);
  },

  async submitPublicPrayer(
    token: string,
    data: Pick<CreatePrayerDto, 'name' | 'request' | 'isAnonymous'>
  ): Promise<{ success: true; message: string }> {
    const response = await fetch(
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
    const response = await fetch(
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
    const response = await fetch(`${API_BASE}/vehicle-notices${query ? `?${query}` : ''}`, {
      headers: authHeaders(),
    });
    return handleResponse<VehicleNotice[]>(response);
  },

  async getVehicleNoticeStats(date?: string): Promise<VehicleNoticeStats> {
    const params = date ? `?date=${date}` : '';
    const response = await fetch(`${API_BASE}/vehicle-notices/stats${params}`, {
      headers: authHeaders(),
    });
    return handleResponse<VehicleNoticeStats>(response);
  },

  async updateVehicleNoticeStatus(
    id: string,
    status: VehicleNoticeStatus
  ): Promise<VehicleNotice> {
    const response = await fetch(`${API_BASE}/vehicle-notices/${id}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
    return handleResponse<VehicleNotice>(response);
  },
};
