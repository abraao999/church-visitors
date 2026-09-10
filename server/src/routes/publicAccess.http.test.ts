import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { Response } from 'express';
import { Types } from 'mongoose';
import type { GuestAccessRequest } from '../middleware/guestAccess.js';
import { PrayerRequest } from '../models/PrayerRequest.js';
import { Visitor } from '../models/Visitor.js';
import { FAMILY_CITY_ERROR } from '../utils/familyCity.js';
import { createPublicPrayerRequest, createPublicVisitors } from './publicAccess.js';

process.env.GUEST_ACCESS_SECRET = 'teste-guest-idempotencia-chave-longa-654321';
process.env.JWT_SECRET = 'teste-jwt-idempotencia-chave-longa-123456ab';

const churchA = new Types.ObjectId();
const accessId = new Types.ObjectId();

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

function mockRes() {
  const state: { statusCode: number; body: unknown } = { statusCode: 200, body: undefined };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
    setHeader() {
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

function guestReq(scope: 'visitors:create' | 'prayers:create', body: Record<string, unknown>) {
  return {
    method: 'POST',
    params: { token: 'x' },
    body,
    guestAccess: {
      churchId: String(churchA),
      churchName: 'Igreja Alfa',
      guestAccessId: String(accessId),
      accessName: 'Portaria',
      scope,
      scopes: [scope],
    },
  } as unknown as GuestAccessRequest;
}

describe('envio público idempotente', () => {
  test('dois envios de visitantes com o mesmo requestId criam um único registro', async () => {
    let created = 0;
    stubMethod(Visitor, 'exists', async (filter: Record<string, unknown>) => {
      if (filter.requestId === 'req-visit-12345') return { _id: new Types.ObjectId() };
      return null;
    });
    stubMethod(Visitor, 'insertMany', async () => {
      created += 1;
      return [];
    });

    const { res, state } = mockRes();
    await createPublicVisitors(
      guestReq('visitors:create', {
        visitors: [{ name: 'João', city: 'Umuarama', relationship: 'outro' }],
        requestId: 'req-visit-12345',
      }),
      res
    );

    assert.equal(state.statusCode, 201);
    assert.equal(created, 0);
    assert.deepEqual(state.body, { success: true, message: 'Informações enviadas' });
  });

  test('acesso público recusa cidades diferentes na mesma família', async () => {
    stubMethod(Visitor, 'insertMany', async () => {
      throw new Error('não deveria criar visitantes com cidades diferentes');
    });
    const { res, state } = mockRes();
    await createPublicVisitors(
      guestReq('visitors:create', {
        visitors: [
          { name: 'João', city: 'Umuarama', relationship: 'outro', visitKind: 'first' },
          { name: 'Maria', city: 'Cruzeiro do Oeste', relationship: 'outro', visitKind: 'first' },
        ],
      }),
      res
    );
    assert.equal(state.statusCode, 400);
    assert.deepEqual(state.body, { error: FAMILY_CITY_ERROR });
  });

  test('dois envios de oração com o mesmo requestId criam um único registro', async () => {
    let created = 0;
    stubMethod(PrayerRequest, 'exists', async (filter: Record<string, unknown>) => {
      if (filter.requestId === 'req-pray-12345') return { _id: new Types.ObjectId() };
      return null;
    });
    stubMethod(PrayerRequest, 'create', async () => {
      created += 1;
      return {};
    });

    const { res, state } = mockRes();
    await createPublicPrayerRequest(
      guestReq('prayers:create', {
        name: 'Ana',
        request: 'Ore pela minha família',
        isAnonymous: false,
        requestId: 'req-pray-12345',
      }),
      res
    );

    assert.equal(state.statusCode, 201);
    assert.equal(created, 0);
    assert.deepEqual(state.body, { success: true, message: 'Informações enviadas' });
  });
});
