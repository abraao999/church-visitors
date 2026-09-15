import { ApiError } from '../api/client';
import type {
  PlatformAdmin,
  PlatformAdminList,
  PlatformAdminRole,
  PlatformActivityList,
  PlatformChurchDetail,
  PlatformChurchList,
  PlatformHealth,
  PlatformOverview,
  PlatformSettings,
  PlatformSettingsUpdate,
} from './adminTypes';

const API_BASE = '/api/system-admin';

async function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, { ...init, credentials: 'include' });
  } catch {
    throw new Error('Não foi possível conectar. Confira a internet e tente de novo.');
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const fallback =
      response.status >= 500
        ? 'O servidor da API não está respondendo. Confira se o backend está rodando na porta 3002.'
        : 'Não foi possível concluir esta ação.';
    throw new ApiError(typeof data.error === 'string' ? data.error : fallback, {
      code: typeof data.code === 'string' ? data.code : undefined,
    });
  }
  return data as T;
}

export const adminApi = {
  async login(email: string, password: string): Promise<PlatformAdmin> {
    const response = await adminFetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await handleResponse<{ admin: PlatformAdmin }>(response);
    return data.admin;
  },

  async logout(): Promise<void> {
    const response = await adminFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    await handleResponse<{ ok: true }>(response);
  },

  async me(): Promise<PlatformAdmin> {
    const response = await adminFetch(`${API_BASE}/auth/me`);
    const data = await handleResponse<{ admin: PlatformAdmin }>(response);
    return data.admin;
  },

  async overview(): Promise<PlatformOverview> {
    const response = await adminFetch(`${API_BASE}/overview`);
    return handleResponse<PlatformOverview>(response);
  },

  async health(): Promise<PlatformHealth> {
    const response = await adminFetch(`${API_BASE}/health`);
    return handleResponse<PlatformHealth>(response);
  },

  async activities(query: { q?: string; operation?: string; page?: number }): Promise<PlatformActivityList> {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.operation) params.set('operation', query.operation);
    if (query.page) params.set('page', String(query.page));
    const response = await adminFetch(`${API_BASE}/activities?${params.toString()}`);
    return handleResponse<PlatformActivityList>(response);
  },

  async admins(): Promise<PlatformAdminList> {
    const response = await adminFetch(`${API_BASE}/admins`);
    return handleResponse<PlatformAdminList>(response);
  },

  async createAdmin(data: { name: string; email: string; password: string; role: PlatformAdminRole }): Promise<void> {
    const response = await adminFetch(`${API_BASE}/admins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    await handleResponse<{ id: string }>(response);
  },

  async updateAdmin(id: string, data: { role?: PlatformAdminRole; active?: boolean }): Promise<void> {
    const response = await adminFetch(`${API_BASE}/admins/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    await handleResponse<{ ok: true }>(response);
  },

  async churches(query: { q?: string; situacao?: string; page?: number }): Promise<PlatformChurchList> {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.situacao) params.set('situacao', query.situacao);
    if (query.page) params.set('page', String(query.page));
    const response = await adminFetch(`${API_BASE}/churches?${params.toString()}`);
    return handleResponse<PlatformChurchList>(response);
  },

  async church(id: string): Promise<PlatformChurchDetail> {
    const response = await adminFetch(`${API_BASE}/churches/${encodeURIComponent(id)}`);
    return handleResponse<PlatformChurchDetail>(response);
  },

  async createChurch(data: {
    churchName: string;
    ownerName: string;
    ownerEmail: string;
    city?: string;
  }): Promise<{ pending: true; emailMasked: string }> {
    const response = await adminFetch(`${API_BASE}/churches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<{ pending: true; emailMasked: string }>(response);
  },

  async suspendChurch(id: string, reason: string, confirmName: string): Promise<void> {
    const response = await adminFetch(`${API_BASE}/churches/${encodeURIComponent(id)}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, confirmName }),
    });
    await handleResponse<{ ok: true }>(response);
  },

  async reactivateChurch(id: string): Promise<void> {
    const response = await adminFetch(`${API_BASE}/churches/${encodeURIComponent(id)}/reactivate`, {
      method: 'POST',
    });
    await handleResponse<{ ok: true }>(response);
  },

  async sendPasswordReset(id: string): Promise<void> {
    const response = await adminFetch(`${API_BASE}/churches/${encodeURIComponent(id)}/send-password-reset`, {
      method: 'POST',
    });
    await handleResponse<{ ok: true }>(response);
  },

  async getSettings(): Promise<PlatformSettings> {
    const response = await adminFetch(`${API_BASE}/settings`);
    return handleResponse<PlatformSettings>(response);
  },

  async updateSettings(data: PlatformSettingsUpdate): Promise<PlatformSettings> {
    const response = await adminFetch(`${API_BASE}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<PlatformSettings>(response);
  },

  async sendTestEmail(): Promise<void> {
    const response = await adminFetch(`${API_BASE}/settings/email/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    await handleResponse<{ ok: true }>(response);
  },

  async approveChurch(churchId: string): Promise<void> {
    const response = await adminFetch(`${API_BASE}/churches/${encodeURIComponent(churchId)}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    await handleResponse<{ ok: true }>(response);
  },

  async resendVerification(id: string): Promise<void> {
    const response = await adminFetch(`${API_BASE}/churches/${encodeURIComponent(id)}/resend-verification`, {
      method: 'POST',
    });
    await handleResponse<{ ok: true }>(response);
  },
};
