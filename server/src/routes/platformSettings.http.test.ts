import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose, { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { PlatformAdmin } from '../models/PlatformAdmin.js';
import { PlatformAuditEvent } from '../models/PlatformAuditEvent.js';
import { PlatformSettings } from '../models/PlatformSettings.js';
import { User } from '../models/User.js';
import {
  requirePlatformAdmin,
  requirePlatformRole,
  signPlatformAdminToken,
  type PlatformAdminRequest,
} from '../middleware/platformAdminAuth.js';
import { PLATFORM_ADMIN_COOKIE } from '../utils/platformAdminSession.js';
import { SESSION_COOKIE } from '../utils/sessionCookie.js';
import { approvePlatformChurch } from '../services/platformAdmin.js';
import {
  PLATFORM_AT_CAPACITY_CODE,
  PLATFORM_AT_CAPACITY_ERROR,
  REGISTRATION_PENDING_APPROVAL,
  REGISTRATIONS_CLOSED_CODE,
  REGISTRATIONS_CLOSED_ERROR,
} from '../services/platformSettings.js';
import { LOGIN_INVALID_ERROR, loginAccount, registerAccount } from './auth.js';

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
  const state: { statusCode: number; body: unknown; headers: Record<string, string> } = {
    statusCode: 200,
    body: undefined,
    headers: {},
  };
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
    cookie() {
      return res;
    },
    clearCookie() {
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

describe('autorização das configurações da plataforma', () => {
  test('sem autenticação recebe 401', async () => {
    const { res, state } = mockRes();
    await requirePlatformAdmin({ headers: {} } as PlatformAdminRequest, res, () => undefined);
    assert.equal(state.statusCode, 401);
  });

  test('support, viewer e sessão de igreja recebem 403 ou 401', async () => {
    const { res: supportRes, state: support } = mockRes();
    let next = false;
    requirePlatformRole('platform_owner')(
      { platformAdmin: { role: 'support' } } as PlatformAdminRequest,
      supportRes,
      () => {
        next = true;
      }
    );
    assert.equal(next, false);
    assert.equal(support.statusCode, 403);

    const { res: viewerRes, state: viewer } = mockRes();
    requirePlatformRole('platform_owner')(
      { platformAdmin: { role: 'viewer' } } as PlatformAdminRequest,
      viewerRes,
      () => undefined
    );
    assert.equal(viewer.statusCode, 403);

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

  test('platform_owner passa no papel exigido', () => {
    const { res, state } = mockRes();
    let next = false;
    requirePlatformRole('platform_owner')(
      { platformAdmin: { role: 'platform_owner' } } as PlatformAdminRequest,
      res,
      () => {
        next = true;
      }
    );
    assert.equal(next, true);
    assert.equal(state.statusCode, 200);
  });
});

describe('cadastro fechado e aprovação manual', () => {
  test('cadastro público é recusado com código estável', async () => {
    stubMethod(PlatformSettings, 'findOne', async () => ({
      registrations: { enabled: false, approvalMode: 'automatic' },
    }));
    const { res, state } = mockRes();
    await registerAccount({
      body: {
        churchName: 'Igreja Teste',
        name: 'Ana Silva',
        email: 'ana@igreja.test',
        username: 'anasilva',
        password: 'secret12',
      },
    }, res);
    assert.equal(state.statusCode, 403);
    assert.deepEqual(state.body, {
      error: REGISTRATIONS_CLOSED_ERROR,
      code: REGISTRATIONS_CLOSED_CODE,
    });
  });

  test('cadastro público é recusado no teto da plataforma', async () => {
    stubMethod(PlatformSettings, 'findOne', async () => ({
      registrations: { enabled: true, approvalMode: 'automatic' },
      limits: { maxChurches: 1, maxPendingApprovals: null },
    }));
    stubMethod(Church, 'countDocuments', async () => 1);
    const { res, state } = mockRes();
    await registerAccount({
      body: {
        churchName: 'Igreja Teste',
        name: 'Ana Silva',
        email: 'ana@igreja.test',
        username: 'anasilva',
        password: 'secret12',
      },
    }, res);
    assert.equal(state.statusCode, 403);
    assert.deepEqual(state.body, {
      error: PLATFORM_AT_CAPACITY_ERROR,
      code: PLATFORM_AT_CAPACITY_CODE,
    });
  });

  test('login existente continua funcionando com cadastro fechado', async () => {
    stubMethod(PlatformSettings, 'findOne', async () => ({
      registrations: { enabled: false, approvalMode: 'automatic' },
    }));
    const passwordHash = await bcrypt.hash('senha-certa', 10);
    const churchId = new Types.ObjectId();
    stubMethod(User, 'findOne', async () => ({
      _id: new Types.ObjectId(),
      passwordHash,
      churchId,
      name: 'Ana',
      email: 'ana@igreja.test',
      role: 'owner',
      tokenVersion: 0,
      save: async () => undefined,
    }));
    stubMethod(Church, 'findOne', () => ({
      select: async () => ({
        name: 'Igreja Teste',
        active: true,
        approvalStatus: 'approved',
        visitorFollowUpEnabled: false,
      }),
    }));
    const { res, state } = mockRes();
    await loginAccount({ body: { login: 'ana@igreja.test', password: 'senha-certa' } }, res);
    assert.equal(state.statusCode, 200);
    assert.equal((state.body as { user: { email: string } }).user.email, 'ana@igreja.test');
  });

  test('senha errada não muda com cadastro fechado', async () => {
    stubMethod(PlatformSettings, 'findOne', async () => ({
      registrations: { enabled: false, approvalMode: 'automatic' },
    }));
    stubMethod(User, 'findOne', async () => null);
    const { res, state } = mockRes();
    await loginAccount({ body: { login: 'ana@igreja.test', password: 'errada' } }, res);
    assert.equal(state.statusCode, 401);
    assert.deepEqual(state.body, { error: LOGIN_INVALID_ERROR });
  });

  test('igreja pendente impede sessão e usa a mensagem de aprovação', async () => {
    const passwordHash = await bcrypt.hash('senha-certa', 10);
    stubMethod(User, 'findOne', async () => ({
      _id: new Types.ObjectId(),
      passwordHash,
      churchId: new Types.ObjectId(),
      name: 'Ana',
      email: 'ana@igreja.test',
      role: 'owner',
    }));
    stubMethod(Church, 'findOne', () => ({
      select: async () => ({
        name: 'Igreja Teste',
        active: true,
        approvalStatus: 'pending',
      }),
    }));
    const { res, state } = mockRes();
    await loginAccount({ body: { login: 'ana@igreja.test', password: 'senha-certa' } }, res);
    assert.equal(state.statusCode, 403);
    assert.equal((state.body as { error: string }).error, REGISTRATION_PENDING_APPROVAL);
    assert.equal(JSON.stringify(state.body).includes('Igreja Teste'), false);
  });

  test('aprovação é idempotente, não reativa suspensão e gera auditoria', async () => {
    const churchId = new Types.ObjectId();
    const church = {
      _id: churchId,
      name: 'Igreja Teste',
      active: false,
      approvalStatus: 'pending',
      save: async function save() {
        return this;
      },
    };
    stubMethod(Church, 'findById', async () => church);
    stubMethod(User, 'findOne', async () => ({
      _id: new Types.ObjectId(),
      name: 'Ana',
      email: 'ana@igreja.test',
    }));
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

    const first = await approvePlatformChurch(String(churchId), {
      adminId: new Types.ObjectId().toString(),
      name: 'Ada',
      email: 'ada@eclesiafy.com.br',
      role: 'platform_owner',
      tokenVersion: 0,
    });
    assert.equal(first.alreadyApproved, false);
    assert.equal(church.approvalStatus, 'approved');
    assert.equal(church.active, false);
    assert.equal(audit?.operation, 'church_approved');

    church.approvalStatus = 'approved';
    const second = await approvePlatformChurch(String(churchId), {
      adminId: new Types.ObjectId().toString(),
      name: 'Ada',
      email: 'ada@eclesiafy.com.br',
      role: 'platform_owner',
      tokenVersion: 0,
    });
    assert.equal(second.alreadyApproved, true);
  });

  test('sessão administrativa não autentica nas rotas da igreja', async () => {
    const token = signPlatformAdminToken({
      adminId: new Types.ObjectId().toString(),
      name: 'Ada',
      email: 'ada@eclesiafy.com.br',
      role: 'platform_owner',
      tokenVersion: 0,
    });
    stubMethod(PlatformAdmin, 'findById', async () => ({
      _id: new Types.ObjectId(),
      name: 'Ada',
      email: 'ada@eclesiafy.com.br',
      role: 'platform_owner',
      active: true,
      tokenVersion: 0,
    }));
    const { res, state } = mockRes();
    await requirePlatformAdmin(
      { headers: { cookie: `${PLATFORM_ADMIN_COOKIE}=${token}` } } as PlatformAdminRequest,
      res,
      () => undefined
    );
    assert.equal(state.statusCode, 200);
  });
});
