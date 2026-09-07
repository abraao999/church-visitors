import type {
  PortariaClaimResult,
  PortariaDeviceSession,
  PortariaOfflinePermission,
} from '../types';
import type { VehiclePayload, VisitorsPayload } from './types';

class PortariaApiError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;

  constructor(
    message: string,
    status: number,
    code?: string,
    fields?: Record<string, string>
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function portariaFetch<T>(
  path: string,
  init: RequestInit & { credential?: string } = {}
): Promise<T> {
  const { credential, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(`/api/portaria${path}`, {
      ...rest,
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
        ...rest.headers,
      },
    });
  } catch {
    throw new PortariaApiError('Sem conexão com o servidor.', 0, 'network');
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new PortariaApiError(
      typeof data.error === 'string' ? data.error : 'Não foi possível concluir o envio.',
      response.status,
      typeof data.code === 'string' ? data.code : undefined,
      data.fields && typeof data.fields === 'object'
        ? (data.fields as Record<string, string>)
        : undefined
    );
  }
  return data as T;
}

export function isPortariaApiError(error: unknown): error is PortariaApiError {
  return error instanceof PortariaApiError;
}

export function inspectPairing(token: string) {
  return portariaFetch<{ valid: true; churchName: string; expiresAt: string }>(
    `/pairings/${encodeURIComponent(token)}`
  );
}

export function claimPairing(
  token: string,
  input: { deviceName: string; permissions: PortariaOfflinePermission[] }
) {
  return portariaFetch<PortariaClaimResult>(`/pairings/${encodeURIComponent(token)}/claim`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchDeviceSession(credential: string) {
  return portariaFetch<PortariaDeviceSession>('/device', { credential });
}

export function submitVisitors(
  credential: string,
  payload: VisitorsPayload & { requestId: string; capturedAt: string }
) {
  return portariaFetch<{ success: true; linked: boolean }>(`/visitors`, {
    method: 'POST',
    credential,
    body: JSON.stringify(payload),
  });
}

export function submitVehicleNotice(
  credential: string,
  payload: VehiclePayload & { requestId: string; capturedAt: string }
) {
  return portariaFetch<{ success: true; linked: boolean }>(`/vehicle-notices`, {
    method: 'POST',
    credential,
    body: JSON.stringify(payload),
  });
}

export { PortariaApiError };
