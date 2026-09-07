import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { Response } from 'express';
import { Types } from 'mongoose';
import { requirePermission } from '../middleware/requirePermission.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { listPrayerRequests } from '../routes/prayerRequests.js';
import { PrayerRequest } from '../models/PrayerRequest.js';
import { permissionsForRole } from '../utils/permissions.js';
import { Church } from '../models/Church.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'teste-jwt-permissao-equipe-chave-longa-123456';
process.env.GUEST_ACCESS_SECRET = 'teste-guest-permissao-equipe-chave-longa-654321';

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

function authReq(role: 'owner' | 'portaria' | 'intercession' | 'midia' | 'louvor' | 'admin') {
  return {
    auth: {
      userId: new Types.ObjectId().toHexString(),
      churchId: new Types.ObjectId().toHexString(),
      role,
      name: 'Pessoa',
      email: 'pessoa@igreja.test',
      permissions: permissionsForRole(role),
    },
    query: {},
    params: {},
    body: {},
    headers: {},
  } as unknown as AuthenticatedRequest;
}

describe('checagem de permissão nas APIs', () => {
  test('portaria é impedida de ler oração privada', async () => {
    const { res, state } = mockRes();
    let called = false;
    requirePermission('prayers:read')(authReq('portaria'), res, () => {
      called = true;
    });
    assert.equal(called, false);
    assert.equal(state.statusCode, 403);
  });

  test('intercessão acessa pedidos e portaria acessa visitantes', async () => {
    const prayer = mockRes();
    let prayerOk = false;
    requirePermission('prayers:read')(authReq('intercession'), prayer.res, () => {
      prayerOk = true;
    });
    assert.equal(prayerOk, true);

    const visitors = mockRes();
    let visitorsOk = false;
    requirePermission('visitors:read')(authReq('portaria'), visitors.res, () => {
      visitorsOk = true;
    });
    assert.equal(visitorsOk, true);
  });

  test('mídia abre painéis e não altera a igreja', () => {
    const panels = mockRes();
    let panelsOk = false;
    requirePermission('panels:open')(authReq('midia'), panels.res, () => {
      panelsOk = true;
    });
    assert.equal(panelsOk, true);

    const church = mockRes();
    requirePermission('church:update')(authReq('midia'), church.res, () => {
      assert.fail('mídia não deveria alterar igreja');
    });
    assert.equal(church.state.statusCode, 403);
  });

  test('louvor acessa cultos e Holyrics', () => {
    const services = mockRes();
    let ok = false;
    requirePermission('services:update')(authReq('louvor'), services.res, () => {
      ok = true;
    });
    assert.equal(ok, true);
    const holyrics = mockRes();
    requirePermission('holyrics:sync')(authReq('louvor'), holyrics.res, () => {
      ok = true;
    });
    assert.equal(ok, true);
  });

  test('administrador não recebe permissão de alterar proprietário via church:update', () => {
    const { res, state } = mockRes();
    requirePermission('church:update')(authReq('admin'), res, () => {
      assert.fail('admin não altera dados da igreja');
    });
    assert.equal(state.statusCode, 403);
  });

  test('rota de oração privada usa a igreja da sessão mesmo com permissão', async () => {
    const req = authReq('intercession');
    let filter: Record<string, unknown> | undefined;
    stubMethod(PrayerRequest, 'find', (value: Record<string, unknown>) => {
      filter = value;
      const chain = {
        select() {
          return chain;
        },
        sort: async () => [],
      };
      return chain;
    });
    const { res, state } = mockRes();
    await listPrayerRequests(req, res);
    assert.equal(state.statusCode, 200);
    assert.equal(String(filter?.churchId), req.auth!.churchId);
  });

  test('conta desativada não continua a sessão', async () => {
    const churchId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const token = jwt.sign(
      {
        sub: String(userId),
        churchId: String(churchId),
        role: 'portaria',
        name: 'Ana',
        email: 'ana@igreja.test',
        tv: 0,
      },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256' }
    );

    stubMethod(User, 'findOne', () => ({
      select: async () => ({
        _id: userId,
        churchId,
        role: 'portaria',
        name: 'Ana',
        email: 'ana@igreja.test',
        tokenVersion: 0,
        active: false,
      }),
    }));
    stubMethod(Church, 'exists', async () => true);

    const { res, state } = mockRes();
    await requireAuth(
      { headers: { authorization: `Bearer ${token}` } } as AuthenticatedRequest,
      res,
      () => {
        assert.fail('não deveria autorizar conta desativada');
      }
    );
    assert.equal(state.statusCode, 401);
  });

  test('alteração de função invalida a sessão anterior', async () => {
    const churchId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const token = jwt.sign(
      {
        sub: String(userId),
        churchId: String(churchId),
        role: 'portaria',
        name: 'Ana',
        email: 'ana@igreja.test',
        tv: 0,
      },
      process.env.JWT_SECRET!,
      { algorithm: 'HS256' }
    );

    stubMethod(User, 'findOne', () => ({
      select: async () => ({
        _id: userId,
        churchId,
        role: 'midia',
        name: 'Ana',
        email: 'ana@igreja.test',
        tokenVersion: 1,
        active: true,
        permissions: [],
        permissionsCustomized: false,
      }),
    }));
    stubMethod(Church, 'exists', async () => true);

    const { res, state } = mockRes();
    await requireAuth(
      { headers: { authorization: `Bearer ${token}` } } as AuthenticatedRequest,
      res,
      () => {
        assert.fail('não deveria autorizar sessão com permissões antigas');
      }
    );
    assert.equal(state.statusCode, 401);
  });
});
