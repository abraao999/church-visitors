import { ApiError } from '../api/client';
import type {
  PlatformAdmin,
  PlatformChurchDetail,
  PlatformChurchList,
  PlatformOverview,
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

  async resendVerification(id: string): Promise<void> {
    const response = await adminFetch(`${API_BASE}/churches/${encodeURIComponent(id)}/resend-verification`, {
      method: 'POST',
    });
    await handleResponse<{ ok: true }>(response);
  },
};
