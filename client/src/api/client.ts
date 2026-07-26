import type { CreatePrayerDto, CreateVisitorDto, PrayerRequest, Visitor } from '../types';

const API_BASE = '/api';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Erro na requisição');
  }
  return response.json();
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export const api = {
  async getVisitors(date?: string): Promise<Visitor[]> {
    const params = date ? `?date=${date}` : '';
    const response = await fetch(`${API_BASE}/visitors${params}`);
    return handleResponse<Visitor[]>(response);
  },

  async createVisitor(data: CreateVisitorDto): Promise<Visitor> {
    const response = await fetch(`${API_BASE}/visitors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Visitor>(response);
  },

  async deleteVisitor(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/visitors/${id}`, { method: 'DELETE' });
    await handleResponse(response);
  },

  async getPrayerRequests(date?: string): Promise<PrayerRequest[]> {
    const params = date ? `?date=${date}` : '';
    const response = await fetch(`${API_BASE}/prayer-requests${params}`);
    return handleResponse<PrayerRequest[]>(response);
  },

  async createPrayerRequest(data: CreatePrayerDto): Promise<PrayerRequest> {
    const response = await fetch(`${API_BASE}/prayer-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<PrayerRequest>(response);
  },

  async deletePrayerRequest(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/prayer-requests/${id}`, { method: 'DELETE' });
    await handleResponse(response);
  },
};
