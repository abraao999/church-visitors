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
  deletePrayerRequest,
  listPrayerRequests,
} from './prayerRequests.js';
import {
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
  } = { statusCode: 200, body: undefined };

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

describe('isolamento entre igrejas nas rotas privadas', () => {
  test('listagem de visitantes sempre filtra pela igreja da sessão', async () => {
    let receivedFilter: Record<string, unknown> | undefined;
    stubMethod(Visitor, 'find', (filter: Record<string, unknown>) => {
      receivedFilter = filter;
      return {
        sort: async () => [{ _id: '1', name: 'Visitante A', churchId: churchA }],
      };
    });

    const { res, state } = mockRes();
    await listVisitors(authReq(churchA, userA), res);

    assert.equal(state.statusCode, 200);
    assert.equal(String((receivedFilter as { churchId: Types.ObjectId }).churchId), String(churchA));
    assert.deepEqual(
      withChurch(String(churchB), { churchId: churchA }).churchId.toHexString(),
      String(churchB)
    );
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
  });

  test('pedidos de oração e exclusão respeitam o tenant', async () => {
    let listFilter: Record<string, unknown> | undefined;
    stubMethod(PrayerRequest, 'find', (filter: Record<string, unknown>) => {
      listFilter = filter;
      return { sort: async () => [] };
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
    });

    assert.equal(String(updateFilter?.churchId), String(churchA));
  });
});
