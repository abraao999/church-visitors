import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { Response } from 'express';
import { Types } from 'mongoose';
import { createPublicPrayerRequest, createPublicVisitors } from './publicAccess.js';
import { createPrayerRequest } from './prayerRequests.js';
import { createVisitors } from './visitors.js';
import { GuestAccess } from '../models/GuestAccess.js';
import { Church } from '../models/Church.js';
import { PrayerRequest } from '../models/PrayerRequest.js';
import { Service } from '../models/Service.js';
import { Visitor } from '../models/Visitor.js';
import type { GuestAccessRequest } from '../middleware/guestAccess.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { permissionsForRole } from '../utils/permissions.js';
import { fetchPrayerPanel, fetchVisitorPanel } from '../services/panelData.js';

process.env.JWT_SECRET = 'teste-jwt-vinculo-culto-chave-longa-1234567890ab';
process.env.GUEST_ACCESS_SECRET = 'teste-guest-vinculo-culto-chave-longa-098765';

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

const churchA = new Types.ObjectId();
const accessId = new Types.ObjectId();
const serviceA = new Types.ObjectId();
const serviceB = new Types.ObjectId();

function activeService(churchId: Types.ObjectId, id = serviceA) {
  const now = new Date();
  return {
    _id: id,
    churchId,
    title: 'Culto da noite',
    date: now,
    time: '19:00',
    scheduledStartAt: new Date(now.getTime() - 10 * 60_000),
    durationMinutes: 120,
    activationLeadMinutes: 30,
    hymns: [],
  };
}

function stubLookup(service: ReturnType<typeof activeService> | null) {
  stubMethod(Church, 'findById', () => ({
    select: async () => ({ timezone: 'America/Sao_Paulo' }),
  }));
  stubMethod(Service, 'updateOne', async () => ({ modifiedCount: 0 }));
  stubMethod(GuestAccess, 'updateOne', async () => ({ modifiedCount: 1 }));
  stubMethod(Service, 'find', async () => (service ? [service] : []));
  stubMethod(Service, 'findOne', async (filter: Record<string, unknown>) => {
    if (!service) return null;
    if (filter._id && String(filter._id) !== String(service._id)) return null;
    if (filter.churchId && String(filter.churchId) !== String(service.churchId)) return null;
    return service;
  });
}

function guestReq(body: Record<string, unknown>): GuestAccessRequest {
  return {
    method: 'POST',
    params: { token: 'x' },
    body,
    guestAccess: {
      churchId: String(churchA),
      churchName: 'Igreja Alfa',
      guestAccessId: String(accessId),
      accessName: 'Portaria',
      scope: 'visitors:create',
      scopes: ['visitors:create'],
    },
  } as unknown as GuestAccessRequest;
}

function ownerReq(body: Record<string, unknown>): AuthenticatedRequest {
  return {
    auth: {
      userId: String(new Types.ObjectId()),
      churchId: String(churchA),
      role: 'owner',
      name: 'Abraão',
      email: 'owner@example.com',
      permissions: permissionsForRole('owner'),
    },
    query: {},
    params: {},
    body,
    headers: {},
  } as unknown as AuthenticatedRequest;
}

describe('vínculo de registros ao culto ativo', () => {
  test('visitante e oração públicos entram no culto ativo da igreja do token', async () => {
    stubLookup(activeService(churchA));
    let visitorDoc: Record<string, unknown> | undefined;
    stubMethod(Visitor, 'exists', async () => null);
    stubMethod(Visitor, 'insertMany', async (docs: Array<Record<string, unknown>>) => {
      visitorDoc = docs[0];
      return docs;
    });
    stubMethod(PrayerRequest, 'exists', async () => null);
    let prayerDoc: Record<string, unknown> | undefined;
    stubMethod(PrayerRequest, 'create', async (doc: Record<string, unknown>) => {
      prayerDoc = doc;
      return doc;
    });

    const visitors = mockRes();
    await createPublicVisitors(
      guestReq({ visitors: [{ name: 'Carlos', city: 'Umuarama', relationship: 'outro' }] }),
      visitors.res
    );
    assert.equal(visitors.state.statusCode, 201);
    assert.equal(String(visitorDoc?.serviceId), String(serviceA));

    const prayer = mockRes();
    await createPublicPrayerRequest(
      {
        ...guestReq({ name: 'Ana', request: 'Ore por nós', isAnonymous: false }),
        guestAccess: {
          churchId: String(churchA),
          churchName: 'Igreja Alfa',
          guestAccessId: String(accessId),
          accessName: 'Oração',
          scope: 'prayers:create',
          scopes: ['prayers:create'],
        },
      } as GuestAccessRequest,
      prayer.res
    );
    assert.equal(prayer.state.statusCode, 201);
    assert.equal(String(prayerDoc?.serviceId), String(serviceA));
  });

  test('sem culto ativo o envio público continua e fica sem serviceId', async () => {
    stubLookup(null);
    let visitorDoc: Record<string, unknown> | undefined;
    stubMethod(Visitor, 'exists', async () => null);
    stubMethod(Visitor, 'insertMany', async (docs: Array<Record<string, unknown>>) => {
      visitorDoc = docs[0];
      return docs;
    });

    const { res, state } = mockRes();
    await createPublicVisitors(
      guestReq({ visitors: [{ name: 'Carlos', city: 'Umuarama', relationship: 'outro' }] }),
      res
    );
    assert.equal(state.statusCode, 201);
    assert.equal(visitorDoc?.serviceId, undefined);
  });

  test('envio público rejeita serviceId escolhido no celular', async () => {
    const { res, state } = mockRes();
    await createPublicVisitors(
      guestReq({
        serviceId: String(serviceB),
        visitors: [{ name: 'Carlos', city: 'Umuarama', relationship: 'outro' }],
      }),
      res
    );
    assert.equal(state.statusCode, 400);
  });

  test('cadastro privado recusa culto de outra igreja', async () => {
    stubLookup(activeService(churchA));
    stubMethod(Visitor, 'insertMany', async () => {
      throw new Error('não deveria gravar');
    });
    const { res, state } = mockRes();
    await createVisitors(
      ownerReq({
        serviceId: String(serviceB),
        visitors: [{ name: 'João', city: 'Umuarama', relationship: 'outro' }],
      }),
      res
    );
    assert.equal(state.statusCode, 400);
    assert.match(String((state.body as { error?: string }).error), /não pertence/);
  });

  test('cadastro privado usa o culto ativo automaticamente', async () => {
    stubLookup(activeService(churchA));
    let created: Record<string, unknown> | undefined;
    stubMethod(Visitor, 'insertMany', async (docs: Array<Record<string, unknown>>) => {
      created = docs[0];
      return docs;
    });
    stubMethod(PrayerRequest, 'create', async (doc: Record<string, unknown>) => doc);

    const visitors = mockRes();
    await createVisitors(
      ownerReq({ visitors: [{ name: 'João', city: 'Umuarama', relationship: 'outro' }] }),
      visitors.res
    );
    assert.equal(visitors.state.statusCode, 201);
    assert.equal(String(created?.serviceId), String(serviceA));

    const prayer = mockRes();
    await createPrayerRequest(ownerReq({ name: 'Ana', request: 'Ore', isAnonymous: false }), prayer.res);
    assert.equal(prayer.state.statusCode, 201);
  });

  test('painéis só mostram dados do culto ativo e ficam vazios sem culto', async () => {
    stubLookup(null);
    const emptyVisitors = await fetchVisitorPanel(String(churchA), new Date());
    const emptyPrayers = await fetchPrayerPanel(String(churchA), new Date());
    assert.deepEqual(emptyVisitors, []);
    assert.deepEqual(emptyPrayers, []);

    stubLookup(activeService(churchA));
    stubMethod(Visitor, 'find', (filter: Record<string, unknown>) => {
      assert.equal(String(filter.serviceId), String(serviceA));
      assert.equal(String(filter.churchId), String(churchA));
      return {
        select() {
          return this;
        },
        async sort() {
          return [];
        },
      };
    });
    await fetchVisitorPanel(String(churchA), new Date());
  });
});
