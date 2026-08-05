import type {
  AuthUser,
  CreatePrayerDto,
  CreateServiceDto,
  CreateServiceResponse,
  CreateVisitorDto,
  PrayerRequest,
  Service,
  UpdateServiceDto,
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

  async loginWithGoogle(credential: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
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
};
