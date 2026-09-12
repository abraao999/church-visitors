import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import { Church } from '../models/Church.js';
import { PlatformAdmin } from '../models/PlatformAdmin.js';
import { PlatformAuditEvent } from '../models/PlatformAuditEvent.js';
import { PublicRateLimit } from '../models/PublicRateLimit.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import {
  requirePlatformAdmin,
  requirePlatformRole,
  signPlatformAdminToken,
  type PlatformAdminRequest,
} from '../middleware/platformAdminAuth.js';
import { PLATFORM_ADMIN_COOKIE } from '../utils/platformAdminSession.js';
import { SESSION_COOKIE } from '../utils/sessionCookie.js';
import {
  churchSituation,
  reactivatePlatformChurch,
  suspendPlatformChurch,
} from '../services/platformAdmin.js';
import { LOGIN_ID_LIMIT, LOGIN_IP_LIMIT, requireAdminLoginLimit } from './systemAdmin.js';

process.env.JWT_SECRET = 'teste-jwt-enumeracao-conta-chave-longa-123456';
process.env.GUEST_ACCESS_SECRET = 'teste-guest-enumeracao-conta-chave-longa-654321';
process.env.EMAIL_TOKEN_SECRET = 'teste-email-token-secret-chave-longa-abcdef';
process.env.PLATFORM_ADMIN_JWT_SECRET = 'teste-platform-admin-secret-chave-longa-xyz';
process.env.CRON_SECRET = 'teste-cron-secret-chave-longa-diferente-999';
process.env.APP_ORIGIN = 'https://app.eclesiafy.com.br';

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

describe('painel administrativo da plataforma', () => {
  test('situação da igreja não inventa estado sem dados', () => {
    assert.equal(churchSituation({ active: false, city: 'Umuarama', emailVerifiedAt: new Date() }), 'suspensa');
    assert.equal(churchSituation({ active: true, city: '', emailVerifiedAt: new Date() }), 'pendente');
    assert.equal(churchSituation({ active: true, city: 'Umuarama', emailVerifiedAt: null }), 'pendente');
    assert.equal(churchSituation({ active: true, city: 'Umuarama', emailVerifiedAt: new Date() }), 'ativa');
  });

  test('sessão de igreja é recusada nas rotas administrativas', async () => {
    const churchToken = jwt.sign(
      { sub: new Types.ObjectId().toString(), churchId: new Types.ObjectId().toString(), tv: 0 },
      process.env.JWT_SECRET as string,
      { algorithm: 'HS256' }
    );
    const { res, state } = mockRes();
    await requirePlatformAdmin(
      { headers: { cookie: `${SESSION_COOKIE}=${churchToken}` } } as PlatformAdminRequest,
      res,
      () => undefined
    );
    assert.equal(state.statusCode, 401);
  });

  test('sessão administrativa é recusada nas rotas privadas da igreja', async () => {
    const admin = {
      adminId: new Types.ObjectId().toString(),
      name: 'Ada',
      email: 'ada@eclesiafy.com.br',
      role: 'platform_owner' as const,
      tokenVersion: 0,
    };
    const token = signPlatformAdminToken(admin);
    const { res, state } = mockRes();
    await requireAuth(
      { headers: { cookie: `${PLATFORM_ADMIN_COOKIE}=${token}` } } as Parameters<typeof requireAuth>[0],
      res,
      () => undefined
    );
    assert.equal(state.statusCode, 401);
  });

  test('viewer não suspende nem reativa', () => {
    const { res, state } = mockRes();
    let nextCalled = false;
    requirePlatformRole('platform_owner')(
      { platformAdmin: { role: 'viewer' } } as PlatformAdminRequest,
      res,
      () => {
        nextCalled = true;
      }
    );
    assert.equal(nextCalled, false);
    assert.equal(state.statusCode, 403);
  });

  test('suspensão invalida as sessões dos usuários', async () => {
    const churchId = new Types.ObjectId();
    const church = {
      _id: churchId,
      name: 'Igreja Teste',
      active: true,
      save: async function save() {
        this.active = false;
        return this;
      },
    };
    stubMethod(Church, 'findById', async () => church);
    let tokenFilter: unknown;
    let tokenUpdate: unknown;
    stubMethod(User, 'updateMany', async (filter: unknown, update: unknown) => {
      tokenFilter = filter;
      tokenUpdate = update;
      return { modifiedCount: 2 };
    });
    stubMethod(PlatformAuditEvent, 'create', async () => [{}]);

    await suspendPlatformChurch(String(churchId), 'Uso indevido', 'Igreja Teste', {
      adminId: new Types.ObjectId().toString(),
      name: 'Ada',
      email: 'ada@eclesiafy.com.br',
      role: 'platform_owner',
      tokenVersion: 0,
    });
    assert.equal(church.active, false);
    assert.deepEqual(tokenFilter, { churchId: church._id });
    assert.deepEqual(tokenUpdate, { $inc: { tokenVersion: 1 } });
  });

  test('reativação não recupera sessões antigas', async () => {
    const churchId = new Types.ObjectId();
    const church = {
      _id: churchId,
      name: 'Igreja Teste',
      active: false,
      save: async function save() {
        this.active = true;
        return this;
      },
    };
    stubMethod(Church, 'findById', async () => church);
    let tokenTouched = false;
    stubMethod(User, 'updateMany', async () => {
      tokenTouched = true;
      return { modifiedCount: 0 };
    });
    stubMethod(PlatformAuditEvent, 'create', async () => [{}]);

    await reactivatePlatformChurch(String(churchId), {
      adminId: new Types.ObjectId().toString(),
      name: 'Ada',
      email: 'ada@eclesiafy.com.br',
      role: 'platform_owner',
      tokenVersion: 0,
    });
    assert.equal(church.active, true);
    assert.equal(tokenTouched, false);
  });

  test('igreja inativa perde autenticação, acesso público, TV e portaria', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const src = join(dirname(fileURLToPath(import.meta.url)), '../../src');
    const auth = readFileSync(join(src, 'middleware/auth.ts'), 'utf8');
    const guest = readFileSync(join(src, 'middleware/guestAccess.ts'), 'utf8');
    const portaria = readFileSync(join(src, 'middleware/portariaDevice.ts'), 'utf8');
    const worship = readFileSync(join(src, 'routes/worshipPanel.ts'), 'utf8');
    assert.match(auth, /Church\.exists\(\{ _id: user\.churchId, active: true \}\)/);
    assert.match(guest, /Church\.findOne\(\{ _id: access\.churchId, active: true \}\)/);
    assert.match(portaria, /Church\.findOne\(\{ _id: device\.churchId, active: true \}\)/);
    assert.match(worship, /requireAuth/);

    const churchId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    stubMethod(User, 'findOne', () => ({
      select: async () => ({
        _id: userId,
        churchId,
        role: 'owner',
        name: 'Ana',
        email: 'ana@igreja.test',
        tokenVersion: 0,
        active: true,
        permissions: [],
        permissionsCustomized: false,
      }),
    }));
    stubMethod(Church, 'exists', async () => null);
    const token = jwt.sign(
      { sub: String(userId), churchId: String(churchId), role: 'owner', name: 'Ana', email: 'ana@igreja.test', tv: 0 },
      process.env.JWT_SECRET as string,
      { algorithm: 'HS256' }
    );
    const { res, state } = mockRes();
    await requireAuth(
      { headers: { authorization: `Bearer ${token}` } } as Parameters<typeof requireAuth>[0],
      res,
      () => {
        assert.fail('igreja suspensa não deve autenticar');
      }
    );
    assert.equal(state.statusCode, 401);
  });

  test('auditoria registra suspensão sem dados sensíveis', async () => {
    const churchId = new Types.ObjectId();
    const church = {
      _id: churchId,
      name: 'Igreja Teste',
      active: true,
      save: async function save() {
        this.active = false;
        return this;
      },
    };
    stubMethod(Church, 'findById', async () => church);
    stubMethod(User, 'updateMany', async () => ({ modifiedCount: 1 }));
    Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, get: () => 1 });
    stubs.push({
      restore: () => {
        delete (mongoose.connection as { readyState?: unknown }).readyState;
      },
    });
    let audit: Record<string, unknown> | undefined;
    stubMethod(PlatformAuditEvent, 'create', async (doc: Record<string, unknown>) => {
      audit = doc;
      return [doc];
    });

    await suspendPlatformChurch(String(churchId), 'Uso indevido', 'Igreja Teste', {
      adminId: new Types.ObjectId().toString(),
      name: 'Ada',
      email: 'ada@eclesiafy.com.br',
      role: 'platform_owner',
      tokenVersion: 0,
    });
    assert.equal(audit?.operation, 'church_suspended');
    assert.equal(audit?.reason, 'Uso indevido');
    assert.equal(JSON.stringify(audit).includes('password'), false);
    assert.equal(JSON.stringify(audit).includes('token'), false);
  });

  test('listagem administrativa não usa churchId de sessão de igreja', async () => {
    const { listPlatformChurches } = await import('../services/platformAdmin.js');
    let pipeline: unknown[] = [];
    stubMethod(Church, 'aggregate', async (stages: unknown[]) => {
      pipeline = stages;
      return [{ items: [], total: [] }];
    });
    await listPlatformChurches({ page: 1, pageSize: 20 });
    assert.deepEqual(pipeline[0], { $match: {} });
    assert.equal(JSON.stringify(pipeline).includes('session'), false);
  });

  test('limite de tentativas do login administrativo bloqueia IP e conta', async () => {
    const buckets = new Map<string, number>();
    stubMethod(PublicRateLimit, 'findOneAndUpdate', async (filter: { _id: string }) => {
      const count = (buckets.get(filter._id) ?? 0) + 1;
      buckets.set(filter._id, count);
      return { count };
    });

    async function hit(ip: string, email: string): Promise<number> {
      const { res, state } = mockRes();
      const allowed = await requireAdminLoginLimit(
        {
          ip,
          socket: { remoteAddress: ip },
          body: { email, password: 'x' },
        } as PlatformAdminRequest,
        res
      );
      return allowed ? 200 : state.statusCode;
    }

    const ip = '203.0.113.80';
    for (let attempt = 1; attempt <= LOGIN_IP_LIMIT; attempt += 1) {
      assert.equal(await hit(ip, `admin${attempt}@eclesiafy.com.br`), 200, `login ${attempt}`);
    }
    assert.equal(await hit(ip, 'outra@eclesiafy.com.br'), 429);

    buckets.clear();
    const email = 'ada@eclesiafy.com.br';
    for (let attempt = 1; attempt <= LOGIN_ID_LIMIT; attempt += 1) {
      assert.equal(await hit(`198.51.100.${attempt}`, email), 200, `conta ${attempt}`);
    }
    assert.equal(await hit('198.51.100.200', email), 429);
  });

  test('login administrativo válido e inválido', async () => {
    const passwordHash = await bcrypt.hash('Admin1234', 10);
    stubMethod(PlatformAdmin, 'findOne', async (filter: { email?: string }) => {
      if (filter.email !== 'ada@eclesiafy.com.br') return null;
      return {
        _id: new Types.ObjectId(),
        name: 'Ada',
        email: 'ada@eclesiafy.com.br',
        passwordHash,
        role: 'platform_owner',
        active: true,
        tokenVersion: 0,
        save: async () => undefined,
      };
    });
    const { authenticatePlatformAdmin } = await import('../services/platformAdmin.js');
    const ok = await authenticatePlatformAdmin('ada@eclesiafy.com.br', 'Admin1234');
    assert.equal(ok.email, 'ada@eclesiafy.com.br');
    await assert.rejects(() => authenticatePlatformAdmin('ada@eclesiafy.com.br', 'errada'), /invalid/);
  });

  test('lista paginada aplica busca segura e filtro', async () => {
    const { listPlatformChurches } = await import('../services/platformAdmin.js');
    let ownerFilter: { $or?: Array<{ name?: RegExp }> } = {};
    stubMethod(User, 'find', (filter: { $or?: Array<{ name?: RegExp }> }) => {
      ownerFilter = filter;
      return { limit: async () => [{ churchId: new Types.ObjectId() }] };
    });
    stubMethod(Church, 'aggregate', async () => [{
      items: [{
        _id: new Types.ObjectId(),
        name: 'Igreja Teste',
        city: 'Umuarama',
        createdAt: new Date(),
        situation: 'ativa',
        owner: { name: 'Ana', email: 'ana@igreja.test' },
        members: { count: 2 },
      }],
      total: [{ count: 1 }],
    }]);
    const result = await listPlatformChurches({ q: 'ana.(test)', situacao: 'ativa', page: 1, pageSize: 20 });
    assert.equal(result.items.length, 1);
    assert.equal(result.total, 1);
    assert.equal(ownerFilter.$or?.[0]?.name?.source.includes('ana\\.\\(test\\)'), true);
    assert.equal(JSON.stringify(result).includes('passwordHash'), false);
  });

  test('respostas administrativas não incluem senha nem tokens', async () => {
    const { getPlatformChurchDetail } = await import('../services/platformAdmin.js');
    const churchId = new Types.ObjectId();
    stubMethod(Church, 'findById', async () => ({
      _id: churchId,
      name: 'Igreja Teste',
      city: 'Umuarama',
      active: true,
      createdAt: new Date(),
      visitorFollowUpEnabled: true,
      branding: { logoUrl: 'https://cdn.test/logo.png' },
    }));
    stubMethod(User, 'findOne', async () => ({
      name: 'Ana',
      email: 'ana@igreja.test',
      emailVerifiedAt: new Date(),
      lastSeenAt: new Date(),
      active: true,
    }));
    stubMethod(User, 'countDocuments', async () => 3);
    const { Visitor } = await import('../models/Visitor.js');
    const { Service } = await import('../models/Service.js');
    const { GuestAccess } = await import('../models/GuestAccess.js');
    const { PortariaDevice } = await import('../models/PortariaDevice.js');
    const { HolyricsSettings } = await import('../models/HolyricsSettings.js');
    stubMethod(Visitor, 'countDocuments', async () => 10);
    stubMethod(Service, 'countDocuments', async () => 2);
    stubMethod(GuestAccess, 'countDocuments', async () => 1);
    stubMethod(PortariaDevice, 'countDocuments', async () => 1);
    stubMethod(HolyricsSettings, 'exists', async () => true);

    const detail = await getPlatformChurchDetail(String(churchId));
    const serialized = JSON.stringify(detail);
    assert.equal(serialized.includes('password'), false);
    assert.equal(serialized.includes('passwordHash'), false);
    assert.equal(serialized.includes('token'), false);
    assert.equal(detail.owner?.email, 'ana@igreja.test');
  });
});
