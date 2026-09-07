import { nextBackoffMs } from './constants';
import { fetchDeviceSession, isPortariaApiError, submitVehicleNotice, submitVisitors } from './api';
import { clockOffsetFrom } from './clock';
import { writeClockOffset } from './db';
import { decryptItem, markItem, pendingItems, removeItem } from './queue';
import type { ConnectionState, DeviceCredential, QueueItemRecord, VehiclePayload, VisitorsPayload } from './types';

export interface SyncResult {
  state: ConnectionState;
  sent: number;
  remaining: number;
  error?: string;
}

let syncing = false;

export function isSyncing(): boolean {
  return syncing;
}

async function runLocked<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('portaria-sync', work);
  }
  return work();
}

async function sendItem(credential: string, item: QueueItemRecord) {
  if (item.type === 'visitors') {
    const payload = await decryptItem<VisitorsPayload>(item);
    return submitVisitors(credential, {
      ...payload,
      requestId: item.requestId,
      capturedAt: item.capturedAt,
    });
  }
  const payload = await decryptItem<VehiclePayload>(item);
  return submitVehicleNotice(credential, {
    ...payload,
    requestId: item.requestId,
    capturedAt: item.capturedAt,
  });
}

export async function syncQueue(session: DeviceCredential): Promise<SyncResult> {
  if (syncing) {
    return { state: 'syncing', sent: 0, remaining: (await pendingItems(session.publicId)).length };
  }

  return runLocked(async () => {
    syncing = true;
    try {
      const heartbeat = await fetchDeviceSession(session.credential);
      await writeClockOffset(clockOffsetFrom(heartbeat.serverTime));

      const items = (await pendingItems(session.publicId)).filter(
        (item) => item.status === 'queued' || item.status === 'syncing'
      );
      let sent = 0;
      for (const item of items) {
        const now = Date.now();
        if (
          item.lastAttemptAt &&
          now - new Date(item.lastAttemptAt).getTime() < nextBackoffMs(item.attemptCount)
        ) {
          continue;
        }
        await markItem(item, { status: 'syncing', lastAttemptAt: new Date().toISOString() });
        try {
          await sendItem(session.credential, item);
          await removeItem(item.localId);
          sent += 1;
        } catch (error) {
          if (isPortariaApiError(error) && error.code === 'revoked') {
            await markItem(item, { status: 'blocked', lastError: error.message });
            return {
              state: 'revoked',
              sent,
              remaining: (await pendingItems(session.publicId)).length,
              error: 'Este aparelho não possui mais acesso.',
            };
          }
          if (isPortariaApiError(error) && (error.status === 422 || error.code === 'review')) {
            await markItem(item, {
              status: 'review',
              lastError: error.message,
              fieldErrors: error.fields,
              attemptCount: item.attemptCount + 1,
              lastAttemptAt: new Date().toISOString(),
            });
            continue;
          }
          if (isPortariaApiError(error) && (error.code === 'expired' || error.status === 404)) {
            return {
              state: 'revoked',
              sent,
              remaining: (await pendingItems(session.publicId)).length,
              error: error.message,
            };
          }
          await markItem(item, {
            status: 'queued',
            attemptCount: item.attemptCount + 1,
            lastAttemptAt: new Date().toISOString(),
            lastError: error instanceof Error ? error.message : 'Falha temporária',
          });
          return {
            state: 'failed',
            sent,
            remaining: (await pendingItems(session.publicId)).length,
            error: 'Não foi possível enviar. Seus cadastros continuam guardados neste aparelho.',
          };
        }
      }

      const remaining = (await pendingItems(session.publicId)).length;
      return { state: remaining ? 'online' : 'online', sent, remaining };
    } catch (error) {
      if (isPortariaApiError(error) && error.code === 'revoked') {
        return {
          state: 'revoked',
          sent: 0,
          remaining: (await pendingItems(session.publicId)).length,
          error: 'Este aparelho não possui mais acesso.',
        };
      }
      if (isPortariaApiError(error) && error.code === 'network') {
        return { state: 'offline', sent: 0, remaining: (await pendingItems(session.publicId)).length };
      }
      return {
        state: 'failed',
        sent: 0,
        remaining: (await pendingItems(session.publicId)).length,
        error: 'Não foi possível enviar. Seus cadastros continuam guardados neste aparelho.',
      };
    } finally {
      syncing = false;
    }
  });
}

export async function probeConnection(credential: string): Promise<'online' | 'offline' | 'revoked'> {
  try {
    const session = await fetchDeviceSession(credential);
    await writeClockOffset(clockOffsetFrom(session.serverTime));
    return 'online';
  } catch (error) {
    if (isPortariaApiError(error) && error.code === 'revoked') return 'revoked';
    return 'offline';
  }
}
