import type { PortariaOfflinePermission, Relationship, VehicleNoticeAction, VisitKind } from '../types';

export type QueueItemType = 'visitors' | 'vehicle_notice';
export type QueueItemStatus = 'queued' | 'syncing' | 'sent' | 'review' | 'blocked';

export interface VisitorDraft {
  name: string;
  city: string;
  relationship: Relationship;
  panelObservation?: string;
  showObservationOnPanel?: boolean;
  visitKind?: VisitKind;
  includeFollowUp?: boolean;
}

export interface VisitorsPayload {
  visitors: VisitorDraft[];
  contactConsent?: boolean;
  phone?: string;
}

export interface VehiclePayload {
  plate: string;
  vehicleModel: string;
  requestedAction: VehicleNoticeAction;
  otherDescription?: string;
  details?: string;
}

export type QueuePayload = VisitorsPayload | VehiclePayload;

export interface QueueItemRecord {
  localId: string;
  requestId: string;
  type: QueueItemType;
  encryptedPayload: ArrayBuffer;
  iv: ArrayBuffer;
  capturedAt: string;
  churchDevicePublicId: string;
  status: QueueItemStatus;
  attemptCount: number;
  lastAttemptAt?: string;
  createdAt: string;
  summary: string;
  lastError?: string;
  fieldErrors?: Record<string, string>;
}

export interface DeviceCredential {
  credential: string;
  publicId: string;
  churchName: string;
  deviceName: string;
  permissions: PortariaOfflinePermission[];
  visitorFollowUpEnabled?: boolean;
  createdAt: string;
  formatVersion: number;
}

export interface ClockOffset {
  offsetMs: number;
  serverTime: string;
  localTime: string;
}

export type ConnectionState = 'online' | 'offline' | 'syncing' | 'failed' | 'revoked';
