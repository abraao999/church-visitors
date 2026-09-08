import type { Collection } from 'mongoose';
import { PrayerRequest } from './PrayerRequest.js';
import { RecurrenceSeries } from './RecurrenceSeries.js';
import { VehicleNotice } from './VehicleNotice.js';
import { Visitor } from './Visitor.js';
import {
  REQUEST_ID_INDEX_NAME,
  REQUEST_ID_UNIQUE_INDEX,
  requestIdIndexNeedsReplacement,
} from '../utils/requestIdIndex.js';

async function replaceRequestIdIndex(collection: Collection): Promise<void> {
  const indexes = await collection.indexes();
  const current = indexes.find((index) => index.name === REQUEST_ID_INDEX_NAME);
  if (requestIdIndexNeedsReplacement(current)) {
    try {
      await collection.dropIndex(REQUEST_ID_INDEX_NAME);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('index not found')) throw error;
    }
  }
  await collection.createIndex({ churchId: 1, requestId: 1 }, { ...REQUEST_ID_UNIQUE_INDEX });
}

/** Troca o índice sparse antigo pelo filtro parcial. Seguro em conexão reaproveitada. */
export async function ensureRequestIdUniqueIndexes(): Promise<void> {
  await Promise.all(
    [Visitor, PrayerRequest, VehicleNotice, RecurrenceSeries].map((model) =>
      replaceRequestIdIndex(model.collection)
    )
  );
}
