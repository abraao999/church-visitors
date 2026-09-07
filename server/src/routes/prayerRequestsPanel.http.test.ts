import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import type { Response } from 'express';
import { Types } from 'mongoose';
import { listPrayerRequestsPanel } from './prayerRequests.js';
import { Church } from '../models/Church.js';
import { PrayerRequest } from '../models/PrayerRequest.js';
import { Service } from '../models/Service.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

process.env.GUEST_ACCESS_SECRET = 'teste-guest-painel-oracao-chave-longa-987654';
process.env.JWT_SECRET = 'teste-jwt-painel-oracao-chave-longa-123456';

const churchA = new Types.ObjectId();

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

function panelReq(): AuthenticatedRequest {
  return {
    auth: {
      userId: String(new Types.ObjectId()),
      churchId: String(churchA),
      role: 'owner',
      name: 'Responsável',
      email: 'owner@example.com',
    },
    query: {},
    params: {},
    body: {},
    headers: {},
  } as unknown as AuthenticatedRequest;
}

function stubFind(records: unknown[]) {
  let receivedFilter: Record<string, unknown> | undefined;
  let selectedFields: string | undefined;

  stubMethod(PrayerRequest, 'find', (filter: Record<string, unknown>) => {
    receivedFilter = filter;
    const chain = {
      select(fields: string) {
        selectedFields = fields;
        return chain;
      },
      async sort() {
        return records;
      },
    };
    return chain;
  });

  return {
    filter: () => receivedFilter,
    fields: () => selectedFields,
  };
}

const activeServiceId = new Types.ObjectId();

function stubActiveService() {
  const now = new Date();
  stubMethod(Church, 'findById', () => ({
    select: async () => ({ timezone: 'America/Sao_Paulo' }),
  }));
  stubMethod(Service, 'updateOne', async () => ({ modifiedCount: 0 }));
  stubMethod(Service, 'find', async () => [
    {
      _id: activeServiceId,
      churchId: churchA,
      title: 'Culto da noite',
      date: now,
      time: '19:00',
      scheduledStartAt: new Date(now.getTime() - 5 * 60_000),
      durationMinutes: 120,
      activationLeadMinutes: 30,
      hymns: [],
    },
  ]);
}

describe('painel de TV — pedidos de oração', () => {
  beforeEach(stubActiveService);

  test('só projeta pedidos autorizados da igreja da sessão', async () => {
    const captured = stubFind([]);
    const { res, state } = mockRes();

    await listPrayerRequestsPanel(panelReq(), res);

    assert.equal(state.statusCode, 200);
    const filter = captured.filter() as {
      churchId: Types.ObjectId;
      allowProjection: boolean;
      serviceId: Types.ObjectId;
    };
    assert.equal(String(filter.churchId), String(churchA));
    assert.equal(filter.allowProjection, true);
    assert.equal(String(filter.serviceId), String(activeServiceId));
  });

  test('não carrega quem registrou nem o acesso de origem', async () => {
    const captured = stubFind([]);
    const { res } = mockRes();

    await listPrayerRequestsPanel(panelReq(), res);

    const fields = captured.fields() ?? '';
    assert.equal(fields, 'name request isAnonymous createdAt');
    for (const hidden of ['createdBy', 'guestAccess', 'source']) {
      assert.ok(!fields.includes(hidden), hidden);
    }
  });

  test('exibe apenas o primeiro nome e oculta nome de anônimo', async () => {
    stubFind([
      {
        _id: new Types.ObjectId(),
        name: 'Maria Aparecida da Silva Souza',
        request: 'Orar pela saúde da minha mãe',
        isAnonymous: false,
        createdAt: new Date('2026-09-07T13:00:00Z'),
      },
      {
        _id: new Types.ObjectId(),
        name: 'João Pedro',
        request: 'Pedido reservado',
        isAnonymous: true,
        createdAt: new Date('2026-09-07T12:00:00Z'),
      },
    ]);
    const { res, state } = mockRes();

    await listPrayerRequestsPanel(panelReq(), res);

    const body = state.body as Array<Record<string, unknown>>;
    assert.equal(body[0].name, 'Maria');
    assert.equal(body[0].request, 'Orar pela saúde da minha mãe');
    assert.equal(body[1].name, '');
    assert.equal(body[1].isAnonymous, true);

    for (const item of body) {
      assert.deepEqual(Object.keys(item).sort(), [
        '_id',
        'createdAt',
        'isAnonymous',
        'name',
        'request',
      ]);
    }
  });

  test('data inválida não vira consulta ampla', async () => {
    const captured = stubFind([]);
    const req = panelReq();
    req.query = { date: '07/09/2026' };
    const { res, state } = mockRes();

    await listPrayerRequestsPanel(req, res);

    assert.equal(state.statusCode, 400);
    assert.equal(captured.filter(), undefined);
  });
});
