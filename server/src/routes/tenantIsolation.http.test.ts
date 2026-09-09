import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { Response } from 'express';
import { Types } from 'mongoose';
import {
  markGuestAccessUsed,
  requireGuestAccess,
  type GuestAccessRequest,
} from '../middleware/guestAccess.js';
import {
  createPrayerRequest,
  countPrayerRequests,
  deletePrayerRequest,
  listPrayerRequests,
} from './prayerRequests.js';
import {
  countVisitors,
  createVisitors,
  deleteVisitor,
  listVisitors,
} from './visitors.js';
import { GuestAccess } from '../models/GuestAccess.js';
import { Church } from '../models/Church.js';
import { PublicRateLimit } from '../models/PublicRateLimit.js';
import { Visitor } from '../models/Visitor.js';
import { PrayerRequest } from '../models/PrayerRequest.js';
import { HolyricsSettings } from '../models/HolyricsSettings.js';
import { Service } from '../models/Service.js';
import { createGuestPublicId, createGuestToken } from '../utils/guestToken.js';
import { withChurch } from '../utils/tenant.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { listWorshipPanel } from './worshipPanel.js';

process.env.GUEST_ACCESS_SECRET = 'teste-guest-isolamento-igrejas-chave-outra-654321';
process.env.JWT_SECRET = 'teste-jwt-isolamento-igrejas-chave-longa-123456';

const churchA = new Types.ObjectId();
const churchB = new Types.ObjectId();
const userA = new Types.ObjectId();
const userB = new Types.ObjectId();

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

function stubScheduleLookup() {
  stubMethod(Service, 'find', async () => []);
  stubMethod(Service, 'updateOne', async () => ({ modifiedCount: 0 }));
  stubMethod(Church, 'findById', () => ({
    select: async () => ({ timezone: 'America/Sao_Paulo' }),
  }));
}

function authReq(
  churchId: Types.ObjectId,
  userId: Types.ObjectId,
  extras: Partial<AuthenticatedRequest> = {}
): AuthenticatedRequest {
  return {
    auth: {
      userId: String(userId),
      churchId: String(churchId),
      role: 'owner',
      name: 'Responsável',
      email: 'owner@example.com',
    },
    query: {},
    params: {},
    body: {},
    headers: {},
    ...extras,
  } as AuthenticatedRequest;
}

function mockRes() {
  const state: {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
  } = { statusCode: 200, body: undefined, headers: {} };

  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
    setHeader(name: string, value: string) {
      state.headers[name] = value;
      return res;
    },
  } as unknown as Response;

  return { res, state };
}

describe('isolamento entre igrejas nas rotas privadas', () => {
  test('listagem de visitantes sempre filtra pela igreja da sessão', async () => {
    let receivedFilter: Record<string, unknown> | undefined;
    stubMethod(Visitor, 'find', (filter: Record<string, unknown>) => {
      receivedFilter = filter;
      const chain = {
        select() {
          return chain;
        },
        sort: async () => [
          {
            _id: '1',
            name: 'Visitante A',
            relationship: 'outro',
            city: 'SP',
            churchId: churchA,
            createdBy: { userId: userA, churchId: churchA, name: 'Responsável' },
          },
        ],
      };
      return chain;
    });

    const { res, state } = mockRes();
    await listVisitors(authReq(churchA, userA), res);

    assert.equal(state.statusCode, 200);
    assert.equal(state.headers['Cache-Control'], 'private, no-store');
    assert.equal(state.headers['Vary'], 'Cookie, Authorization');
    assert.equal(String((receivedFilter as { churchId: Types.ObjectId }).churchId), String(churchA));

    const listed = state.body as Array<Record<string, unknown>>;
    assert.equal(listed[0].name, 'Visitante A');
    assert.equal('churchId' in listed[0], false);
    assert.deepEqual(listed[0].createdBy, { name: 'Responsável' });
    assert.deepEqual(
      withChurch(String(churchB), { churchId: churchA }).churchId.toHexString(),
      String(churchB)
    );
  });

  test('contagens da home filtram pela igreja da sessão', async () => {
    let visitorFilter: Record<string, unknown> | undefined;
    stubMethod(Visitor, 'countDocuments', async (filter: Record<string, unknown>) => {
      visitorFilter = filter;
      return 4;
    });
    const visitors = mockRes();
    await countVisitors(authReq(churchA, userA), visitors.res);
    assert.deepEqual(visitors.state.body, { count: 4 });
    assert.equal(String((visitorFilter as { churchId: Types.ObjectId }).churchId), String(churchA));

    let prayerFilter: Record<string, unknown> | undefined;
    stubMethod(PrayerRequest, 'countDocuments', async (filter: Record<string, unknown>) => {
      prayerFilter = filter;
      return 2;
    });
    const prayers = mockRes();
    await countPrayerRequests(authReq(churchB, userB), prayers.res);
    assert.deepEqual(prayers.state.body, { count: 2 });
    assert.equal(String((prayerFilter as { churchId: Types.ObjectId }).churchId), String(churchB));
  });

  test('exclusão de visitante de outra igreja responde 404', async () => {
    const foreignId = new Types.ObjectId().toHexString();
    stubMethod(Visitor, 'findOneAndDelete', async () => null);

    const { res, state } = mockRes();
    await deleteVisitor(
      authReq(churchB, userB, { params: { id: foreignId } as AuthenticatedRequest['params'] }),
      res
    );

    assert.equal(state.statusCode, 404);
  });

  test('criação de visitante grava churchId da sessão, não do body', async () => {
    stubScheduleLookup();
    let inserted: Array<Record<string, unknown>> = [];
    stubMethod(Visitor, 'insertMany', async (docs: Array<Record<string, unknown>>) => {
      inserted = docs;
      return docs;
    });

    const { res, state } = mockRes();
    await createVisitors(
      authReq(churchA, userA, {
        body: {
          churchId: String(churchB),
          visitors: [{ name: 'João', relationship: 'outro', city: 'SP' }],
        },
      }),
      res
    );

    assert.equal(state.statusCode, 201);
    assert.equal(String(inserted[0].churchId), String(churchA));
    assert.equal(inserted[0].source, 'owner');
    assert.equal('churchId' in (state.body as Record<string, unknown>), false);
  });

  test('pedidos de oração e exclusão respeitam o tenant', async () => {
    stubScheduleLookup();
    let listFilter: Record<string, unknown> | undefined;
    stubMethod(PrayerRequest, 'find', (filter: Record<string, unknown>) => {
      listFilter = filter;
      const chain = {
        select() {
          return chain;
        },
        async sort() {
          return [];
        },
      };
      return chain;
    });

    const list = mockRes();
    await listPrayerRequests(authReq(churchA, userA), list.res);
    assert.equal(String((listFilter as { churchId: Types.ObjectId }).churchId), String(churchA));

    stubMethod(PrayerRequest, 'create', async (doc: Record<string, unknown>) => {
      assert.equal(String(doc.churchId), String(churchA));
      assert.equal(doc.source, 'owner');
      return { _id: 'p1', ...doc };
    });

    const create = mockRes();
    await createPrayerRequest(
      authReq(churchA, userA, {
        body: {
          churchId: String(churchB),
          name: 'Ana',
          request: 'Ore por nós',
          isAnonymous: false,
        },
      }),
      create.res
    );
    assert.equal(create.state.statusCode, 201);
    assert.equal('churchId' in (create.state.body as Record<string, unknown>), false);
    assert.equal('userId' in ((create.state.body as { createdBy?: object }).createdBy ?? {}), false);

    stubMethod(PrayerRequest, 'findOneAndDelete', async () => null);
    const remove = mockRes();
    await deletePrayerRequest(
      authReq(churchB, userB, {
        params: { id: new Types.ObjectId().toHexString() } as AuthenticatedRequest['params'],
      }),
      remove.res
    );
    assert.equal(remove.state.statusCode, 404);
  });

  test('consultas de culto e Holyrics usam filtro por igreja', () => {
    const serviceFilter = withChurch(String(churchA), { _id: new Types.ObjectId() });
    const settingsFilter = withChurch(String(churchB));

    assert.equal(serviceFilter.churchId.toHexString(), String(churchA));
    assert.equal(settingsFilter.churchId.toHexString(), String(churchB));
    assert.ok(Service.schema.path('churchId'));
    assert.ok(HolyricsSettings.schema.path('churchId'));
  });
});

describe('acessos convidados', () => {
  function allowRateLimit() {
    stubMethod(
      PublicRateLimit,
      'findOneAndUpdate',
      async () => ({ count: 1 })
    );
  }

  test('metadata pública não expõe churchId e valida assinatura', async () => {
    allowRateLimit();
    const publicId = createGuestPublicId();
    const token = createGuestToken(publicId, 1);

    stubMethod(GuestAccess, 'findOne', () => ({
      select() {
        return {
          lean: async () => ({
            _id: new Types.ObjectId(),
            churchId: churchA,
            name: 'Portaria — domingo',
            publicId,
            type: 'visitors:create',
            version: 1,
            active: true,
          }),
        };
      },
    }));

    stubMethod(Church, 'findOne', () => ({
      select() {
        return {
          lean: async () => ({ _id: churchA, name: 'Igreja Alfa' }),
        };
      },
    }));

    const req = {
      method: 'GET',
      params: { token },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as GuestAccessRequest;
    const { res, state } = mockRes();
    let nextCalled = false;

    await requireGuestAccess()(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.guestAccess?.churchId, String(churchA));
    assert.equal(req.guestAccess?.churchName, 'Igreja Alfa');
    assert.equal(req.guestAccess?.scope, 'visitors:create');
    assert.deepEqual(req.guestAccess?.scopes, ['visitors:create']);
    assert.equal(state.body, undefined);
  });

  test('token inválido, desativado, expirado e renovado são rejeitados', async () => {
    allowRateLimit();
    const publicId = createGuestPublicId();

    const cases: Array<{
      label: string;
      access: Record<string, unknown> | null;
      expectedStatus: number;
      token?: string;
    }> = [
      {
        label: 'inválido',
        access: null,
        expectedStatus: 404,
        token: 'token.invalido',
      },
      {
        label: 'desativado',
        access: {
          _id: new Types.ObjectId(),
          churchId: churchA,
          name: 'Portaria',
          publicId,
          type: 'visitors:create',
          version: 1,
          active: false,
        },
        expectedStatus: 410,
        token: createGuestToken(publicId, 1),
      },
      {
        label: 'expirado',
        access: {
          _id: new Types.ObjectId(),
          churchId: churchA,
          name: 'Portaria',
          publicId,
          type: 'visitors:create',
          version: 1,
          active: true,
          expiresAt: new Date(Date.now() - 60_000),
        },
        expectedStatus: 410,
        token: createGuestToken(publicId, 1),
      },
      {
        label: 'versão antiga após renovação',
        access: {
          _id: new Types.ObjectId(),
          churchId: churchA,
          name: 'Portaria',
          publicId,
          type: 'visitors:create',
          version: 2,
          active: true,
        },
        expectedStatus: 404,
        token: createGuestToken(publicId, 1),
      },
    ];

    for (const item of cases) {
      stubMethod(GuestAccess, 'findOne', () => ({
        select() {
          return { lean: async () => item.access };
        },
      }));

      const req = {
        method: 'GET',
        params: { token: item.token },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as GuestAccessRequest;
      const { res, state } = mockRes();
      let nextCalled = false;
      await requireGuestAccess()(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, false, item.label);
      assert.equal(state.statusCode, item.expectedStatus, item.label);
      while (stubs.length > 1) stubs.pop()?.restore();
    }
  });

  test('escopo cruzado é rejeitado', async () => {
    allowRateLimit();
    const publicId = createGuestPublicId();
    const token = createGuestToken(publicId, 1);

    stubMethod(GuestAccess, 'findOne', () => ({
      select() {
        return {
          lean: async () => ({
            _id: new Types.ObjectId(),
            churchId: churchA,
            name: 'Portaria',
            publicId,
            type: 'visitors:create',
            version: 1,
            active: true,
          }),
        };
      },
    }));

    const req = {
      method: 'POST',
      params: { token },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as GuestAccessRequest;
    const { res, state } = mockRes();
    await requireGuestAccess('prayers:create')(req, res, () => {
      assert.fail('não deveria autorizar escopo cruzado');
    });
    assert.equal(state.statusCode, 403);
    assert.equal(
      (state.body as { error?: string }).error,
      'Esta opção não está disponível neste acesso.'
    );
  });

  test('acesso unificado autoriza as três opções e esconde as demais no metadata', async () => {
    allowRateLimit();
    const publicId = createGuestPublicId();
    const token = createGuestToken(publicId, 1);

    stubMethod(GuestAccess, 'findOne', () => ({
      select() {
        return {
          lean: async () => ({
            _id: new Types.ObjectId(),
            churchId: churchA,
            name: 'Portal público',
            publicId,
            type: 'visitors:create',
            types: ['visitors:create', 'prayers:create', 'vehicle_notices:create'],
            version: 1,
            active: true,
          }),
        };
      },
    }));

    stubMethod(Church, 'findOne', () => ({
      select() {
        return { lean: async () => ({ _id: churchA, name: 'Igreja Alfa' }) };
      },
    }));

    const req = {
      method: 'GET',
      params: { token },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as GuestAccessRequest;
    const { res } = mockRes();
    await requireGuestAccess()(req, res, () => undefined);
    assert.deepEqual(req.guestAccess?.scopes, [
      'visitors:create',
      'prayers:create',
      'vehicle_notices:create',
    ]);

    const prayer = mockRes();
    await requireGuestAccess('prayers:create')(req, prayer.res, () => undefined);
    assert.equal(prayer.state.statusCode, 200);
    assert.equal(req.guestAccess?.scope, 'prayers:create');
  });

  test('token antigo de veículos continua autorizado só nessa opção', async () => {
    allowRateLimit();
    const publicId = createGuestPublicId();
    const token = createGuestToken(publicId, 1);

    stubMethod(GuestAccess, 'findOne', () => ({
      select() {
        return {
          lean: async () => ({
            _id: new Types.ObjectId(),
            churchId: churchA,
            name: 'Estacionamento',
            publicId,
            type: 'vehicle_notices:create',
            version: 1,
            active: true,
          }),
        };
      },
    }));

    stubMethod(Church, 'findOne', () => ({
      select() {
        return { lean: async () => ({ _id: churchA, name: 'Igreja Alfa' }) };
      },
    }));

    const req = {
      method: 'POST',
      params: { token },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as GuestAccessRequest;

    const ok = mockRes();
    await requireGuestAccess('vehicle_notices:create')(req, ok.res, () => undefined);
    assert.equal(ok.state.statusCode, 200);

    const denied = mockRes();
    await requireGuestAccess('visitors:create')(req, denied.res, () => undefined);
    assert.equal(denied.state.statusCode, 403);
  });

  test('markGuestAccessUsed atualiza somente o acesso da igreja correta', async () => {
    let updateFilter: Record<string, unknown> | undefined;
    stubMethod(GuestAccess, 'updateOne', async (filter: Record<string, unknown>) => {
      updateFilter = filter;
      return { acknowledged: true };
    });

    await markGuestAccessUsed({
      churchId: String(churchA),
      churchName: 'Igreja Alfa',
      guestAccessId: new Types.ObjectId().toHexString(),
      accessName: 'Portaria',
      scope: 'visitors:create',
      scopes: ['visitors:create'],
    });

    assert.equal(String(updateFilter?.churchId), String(churchA));
  });

  test('painel do culto só consulta a igreja da sessão e o culto ativo dela', async () => {
    const serviceId = new Types.ObjectId();
    stubMethod(Church, 'findById', () => ({
      select: async () => ({ name: 'Igreja Alfa', timezone: 'America/Sao_Paulo' }),
    }));
    stubMethod(Service, 'updateOne', async () => ({ modifiedCount: 0 }));
    stubMethod(Service, 'find', async () => [
      {
        _id: serviceId,
        churchId: churchA,
        title: 'Culto',
        date: new Date(),
        time: '19:00',
        scheduledStartAt: new Date(Date.now() - 5 * 60_000),
        durationMinutes: 120,
        activationLeadMinutes: 30,
        hymns: [],
      },
    ]);
    let visitorFilter: Record<string, unknown> | undefined;
    let prayerFilter: Record<string, unknown> | undefined;
    stubMethod(Visitor, 'find', (filter: Record<string, unknown>) => {
      visitorFilter = filter;
      return { select() { return this; }, async sort() { return []; } };
    });
    stubMethod(PrayerRequest, 'find', (filter: Record<string, unknown>) => {
      prayerFilter = filter;
      return { select() { return this; }, async sort() { return []; } };
    });

    const { res, state } = mockRes();
    await listWorshipPanel(authReq(churchA, userA), res);
    assert.equal(state.statusCode, 200);
    assert.equal(String(visitorFilter?.churchId), String(churchA));
    assert.equal(String(visitorFilter?.serviceId), String(serviceId));
    assert.equal(String(prayerFilter?.churchId), String(churchA));
    assert.notEqual(String(visitorFilter?.churchId), String(churchB));
  });
});
