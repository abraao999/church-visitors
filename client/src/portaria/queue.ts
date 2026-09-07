import { createRequestId } from '../utils/requestId';
import { MAX_PENDING, queueCapacity } from './constants';
import { decryptPayload, encryptPayload } from './crypto';
import {
  deleteQueueItem,
  listQueue,
  putQueueItem,
  queueKey,
} from './db';
import { typeLabel, vehicleSummary, visitorsSummary } from './summaries';
import type {
  QueueItemRecord,
  QueueItemType,
  QueuePayload,
  VehiclePayload,
  VisitorsPayload,
} from './types';

export async function pendingItems(publicId: string): Promise<QueueItemRecord[]> {
  return listQueue(publicId);
}

export async function pendingCount(publicId: string): Promise<number> {
  return (await listQueue(publicId)).filter((item) => item.status !== 'sent').length;
}

export async function enqueueItem(input: {
  type: QueueItemType;
  payload: QueuePayload;
  capturedAt: string;
  publicId: string;
}): Promise<QueueItemRecord> {
  const items = await listQueue(input.publicId);
  if (queueCapacity(items.length) === 'full' || items.length >= MAX_PENDING) {
    throw new Error(
      'Este aparelho possui muitos cadastros aguardando envio. Conecte-se à internet antes de continuar.'
    );
  }

  const summary =
    input.type === 'visitors'
      ? visitorsSummary(input.payload as VisitorsPayload)
      : vehicleSummary(input.payload as VehiclePayload);
  const key = await queueKey();
  const encrypted = await encryptPayload(key, input.payload);
  const record: QueueItemRecord = {
    localId: createRequestId(),
    requestId: createRequestId(),
    type: input.type,
    encryptedPayload: encrypted.data,
    iv: encrypted.iv,
    capturedAt: input.capturedAt,
    churchDevicePublicId: input.publicId,
    status: 'queued',
    attemptCount: 0,
    createdAt: new Date().toISOString(),
    summary: `${summary} · ${typeLabel(
      input.type,
      input.type === 'visitors' ? (input.payload as VisitorsPayload).visitors.length : 1
    )}`,
  };
  await putQueueItem(record);
  return record;
}

export async function decryptItem<T extends QueuePayload>(item: QueueItemRecord): Promise<T> {
  const key = await queueKey();
  return decryptPayload<T>(key, item.iv, item.encryptedPayload);
}

export async function markItem(item: QueueItemRecord, patch: Partial<QueueItemRecord>) {
  await putQueueItem({ ...item, ...patch });
}

export async function removeItem(localId: string) {
  await deleteQueueItem(localId);
}
