import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { Response } from 'express';
import { Types } from 'mongoose';
import type { PortariaDeviceRequest } from '../middleware/portariaDevice.js';
import { Visitor } from '../models/Visitor.js';
import { VehicleNotice } from '../models/VehicleNotice.js';
import { PortariaDevice } from '../models/PortariaDevice.js';
import { PortariaPairing } from '../models/PortariaPairing.js';
import { Church } from '../models/Church.js';
import { PublicRateLimit } from '../models/PublicRateLimit.js';
import {
  claimPortariaPairing,
  createPortariaVehicleNotice,
  createPortariaVisitors,
  inspectPortariaPairing,
  portariaSync,
} from './portaria.js';
import {
  createPortariaPairingToken,
  createPortariaPublicId,
} from '../utils/portariaToken.js';

process.env.GUEST_ACCESS_SECRET = 'teste-guest-portaria-http-chave-longa-654321xx';
process.env.JWT_SECRET = 'teste-jwt-portaria-http-chave-longa-123456abcd';

const churchA = new Types.ObjectId();
const churchB = new Types.ObjectId();
const deviceA = new Types.ObjectId();

type Stub = { restore: () => void };
const stubs: Stub[] = [];

function stubMethod(target: object, method: string, implementation: unknown): void {
  const original = (target as Record<string, unknown>)[method];
  (target as Record<string, unknown>)[method] = implementation;
  stubs.push({
    restore: () => {
      (target as Record<string, unknown>)[method] = original;
    },
  });
}

afterEach(() => {
  while (stubs.length) stubs.pop()?.restore();
});

function stubRateLimit() {
  stubMethod(PublicRateLimit, 'findOneAndUpdate', async () => ({ count: 1 }));
}

function mockRes() {
  const state: { statusCode: number; body: Record<string, unknown> } = {
    statusCode: 200,
    body: {},
  };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: Record<string, unknown>) {
      state.body = payload;
      return res;
    },
    setHeader() {
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

function deviceReq(body: Record<string, unknown>, churchId = String(churchA)) {
  return {
    method: 'POST',
    body,
    get() {
      return undefined;
    },
    portariaDevice: {
      churchId,
      churchName: 'Igreja Alfa',
      deviceId: String(deviceA),
      deviceName: 'Tablet da portaria',
      publicId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      permissions: ['offline_visitors:create', 'offline_vehicle_notices:create'],
    },
  } as unknown as PortariaDeviceRequest;
}

describe('sincronização da portaria', () => {
  test('reenvio com o mesmo requestId não duplica visitantes', async () => {
    let created = 0;
    stubMethod(Visitor, 'exists', async (filter: Record<string, unknown>) => {
      if (filter.requestId === 'req-portaria-visit-1') return { _id: new Types.ObjectId() };
      return null;
    });
    stubMethod(Visitor, 'insertMany', async () => {
      created += 1;
      return [];
    });

    const { res, state } = mockRes();
    await createPortariaVisitors(
      deviceReq({
        visitors: [{ name: 'João', city: 'Umuarama', relationship: 'pai' }],
        requestId: 'req-portaria-visit-1',
        capturedAt: new Date().toISOString(),
      }),
      res
    );

    assert.equal(state.statusCode, 201);
    assert.equal(created, 0);
    assert.equal(state.body.success, true);
  });

  test('reenvio com o mesmo requestId não duplica aviso de veículo', async () => {
    let created = 0;
    stubMethod(VehicleNotice, 'exists', async (filter: Record<string, unknown>) => {
      if (filter.requestId === 'req-portaria-car-1') return { _id: new Types.ObjectId() };
      return null;
    });
    stubMethod(VehicleNotice, 'create', async () => {
      created += 1;
    });

    const { res, state } = mockRes();
    await createPortariaVehicleNotice(
      deviceReq({
        plate: 'ABC1D23',
        vehicleModel: 'Gol branco',
        requestedAction: 'turn_off_lights',
        requestId: 'req-portaria-car-1',
        capturedAt: new Date().toISOString(),
      }),
      res
    );

    assert.equal(state.statusCode, 201);
    assert.equal(created, 0);
  });

  test('rejeita churchId e serviceId enviados pelo aparelho', async () => {
    const churchAttempt = mockRes();
    await createPortariaVisitors(
      deviceReq({
        churchId: String(churchB),
        visitors: [{ name: 'Ana', city: 'Umuarama' }],
        capturedAt: new Date().toISOString(),
      }),
      churchAttempt.res
    );
    assert.equal(churchAttempt.state.statusCode, 400);

    const serviceAttempt = mockRes();
    await createPortariaVehicleNotice(
      deviceReq({
        serviceId: String(new Types.ObjectId()),
        plate: 'ABC1D23',
        vehicleModel: 'Gol',
        requestedAction: 'remove_vehicle',
        capturedAt: new Date().toISOString(),
      }),
      serviceAttempt.res
    );
    assert.equal(serviceAttempt.state.statusCode, 400);
  });

  test('grava na igreja da credencial e associa o culto do horário de captura', async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const capturedAt = new Date();
    const serviceId = new Types.ObjectId();
    stubMethod(Visitor, 'exists', async () => null);
    stubMethod(Visitor, 'insertMany', async (docs: Array<Record<string, unknown>>) => {
      inserted.push(...docs);
      return docs;
    });
    stubMethod(portariaSync, 'resolveServiceAtCapture', async (churchId: string, at: Date) => {
      assert.equal(churchId, String(churchA));
      assert.equal(at.toISOString(), capturedAt.toISOString());
      return { _id: serviceId };
    });

    const { res, state } = mockRes();
    await createPortariaVisitors(
      deviceReq({
        visitors: [
          { name: 'Carlos', city: 'Umuarama', relationship: 'outro' },
          { name: 'Mariana', city: 'Umuarama', relationship: 'esposa' },
        ],
        requestId: 'req-familia-1',
        capturedAt: capturedAt.toISOString(),
      }),
      res
    );

    assert.equal(state.statusCode, 201);
    assert.equal(state.body.linked, true);
    assert.equal(inserted.length, 2);
    assert.equal(String(inserted[0].churchId), String(churchA));
    assert.equal(String(inserted[0].serviceId), String(serviceId));
    assert.equal(inserted[0].source, 'portaria_device');
    assert.equal(inserted[0].requestId, 'req-familia-1');
    assert.equal(inserted[1].requestId, undefined);
  });

  test('sem culto no horário de captura grava sem vínculo', async () => {
    const inserted: Array<Record<string, unknown>> = [];
    stubMethod(Visitor, 'exists', async () => null);
    stubMethod(Visitor, 'insertMany', async (docs: Array<Record<string, unknown>>) => {
      inserted.push(...docs);
      return docs;
    });
    stubMethod(portariaSync, 'resolveServiceAtCapture', async () => null);

    const { res, state } = mockRes();
    await createPortariaVisitors(
      deviceReq({
        visitors: [{ name: 'Pedro', city: 'Umuarama', relationship: 'outro' }],
        requestId: 'req-sem-culto-1',
        capturedAt: new Date().toISOString(),
      }),
      res
    );

    assert.equal(state.statusCode, 201);
    assert.equal(state.body.linked, false);
    assert.equal(inserted[0].serviceId, undefined);
  });

  test('horário adulterado vai para revisão e não grava', async () => {
    let created = 0;
    stubMethod(Visitor, 'insertMany', async () => {
      created += 1;
      return [];
    });
    const { res, state } = mockRes();
    await createPortariaVisitors(
      deviceReq({
        visitors: [{ name: 'Pedro', city: 'Umuarama', relationship: 'outro' }],
        requestId: 'req-relogio-1',
        capturedAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      }),
      res
    );
    assert.equal(state.statusCode, 422);
    assert.equal(state.body.code, 'review');
    assert.equal(created, 0);
  });
});

describe('pareamento da portaria', () => {
  test('convite expirado e reutilizado são recusados', async () => {
    stubRateLimit();
    const publicId = createPortariaPublicId();
    const token = createPortariaPairingToken(publicId);
    stubMethod(PortariaPairing, 'findOne', () => ({
      lean: async () => ({
        _id: new Types.ObjectId(),
        churchId: churchA,
        publicId,
        expiresAt: new Date(Date.now() - 1000),
        createdBy: { userId: new Types.ObjectId(), name: 'Dono' },
      }),
    }));

    const expired = mockRes();
    await inspectPortariaPairing(
      { params: { token }, get() { return undefined; }, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as unknown as PortariaDeviceRequest,
      expired.res
    );
    assert.equal(expired.state.statusCode, 410);
    assert.equal(expired.state.body.code, 'pairing_expired');

    stubMethod(PortariaPairing, 'findOne', () => ({
      lean: async () => ({
        _id: new Types.ObjectId(),
        churchId: churchA,
        publicId,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: new Date(),
        createdBy: { userId: new Types.ObjectId(), name: 'Dono' },
      }),
    }));
    const used = mockRes();
    await inspectPortariaPairing(
      { params: { token }, get() { return undefined; }, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as unknown as PortariaDeviceRequest,
      used.res
    );
    assert.equal(used.state.statusCode, 410);
    assert.equal(used.state.body.code, 'pairing_used');
  });

  test('claim cria credencial da igreja do convite e rejeita churchId do cliente', async () => {
    stubRateLimit();
    const publicId = createPortariaPublicId();
    const token = createPortariaPairingToken(publicId);
    const pairingId = new Types.ObjectId();
    stubMethod(PortariaPairing, 'findOne', () => ({
      lean: async () => ({
        _id: pairingId,
        churchId: churchA,
        publicId,
        expiresAt: new Date(Date.now() + 60_000),
        createdBy: { userId: new Types.ObjectId(), name: 'Dono' },
      }),
    }));
    stubMethod(Church, 'findOne', () => ({
      select() {
        return {
          lean: async () => ({ _id: churchA, name: 'Igreja Alfa' }),
        };
      },
    }));

    const rejected = mockRes();
    await claimPortariaPairing(
      {
        params: { token },
        body: { churchId: String(churchB), deviceName: 'Tablet', permissions: ['offline_visitors:create'] },
        get() { return 'Mozilla/5.0'; },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as PortariaDeviceRequest,
      rejected.res
    );
    assert.equal(rejected.state.statusCode, 400);

    let createdChurch: unknown;
    stubMethod(PortariaDevice, 'create', async (doc: Record<string, unknown>) => {
      createdChurch = doc.churchId;
      return {
        _id: new Types.ObjectId(),
        name: doc.name,
        publicId: doc.publicId,
        permissions: doc.permissions,
        credentialVersion: 1,
      };
    });
    stubMethod(PortariaPairing, 'findOneAndUpdate', async () => ({ _id: pairingId }));

    const claimed = mockRes();
    await claimPortariaPairing(
      {
        params: { token },
        body: {
          deviceName: 'Tablet da portaria',
          permissions: ['offline_visitors:create', 'prayers:create'],
        },
        get() { return 'Mozilla/5.0 (iPhone)'; },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as PortariaDeviceRequest,
      claimed.res
    );
    assert.equal(claimed.state.statusCode, 201);
    assert.equal(String(createdChurch), String(churchA));
    assert.deepEqual(claimed.state.body.permissions, ['offline_visitors:create']);
    assert.equal(typeof claimed.state.body.credential, 'string');
    assert.equal('churchId' in claimed.state.body, false);
  });
});
