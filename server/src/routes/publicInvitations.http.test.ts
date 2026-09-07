import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { TeamInvitation } from '../models/TeamInvitation.js';
import { User } from '../models/User.js';
import { TeamAuditEvent } from '../models/TeamAuditEvent.js';
import { createInvitePublicId, createInviteToken } from '../utils/inviteToken.js';
import publicInvitationsRouter from './publicInvitations.js';

process.env.JWT_SECRET = 'teste-jwt-aceite-convite-chave-longa-1234567890';
process.env.GUEST_ACCESS_SECRET = 'teste-guest-aceite-convite-chave-longa-0987654321';

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
  const state: { statusCode: number; body: any } = { statusCode: 200, body: undefined };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
    cookie() {
      return res;
    },
    setHeader() {
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: Request, res: Response, next: () => void) => unknown }>;
  };
};

async function run(method: 'get' | 'post', path: string, req: Partial<Request>) {
  const stack = (publicInvitationsRouter as unknown as { stack: Layer[] }).stack;
  const route = stack.find((item) => item.route?.path === path && item.route.methods[method])?.route;
  assert.ok(route, `rota ${method} ${path} ausente`);
  const { res, state } = mockRes();
  await new Promise<void>((resolve, reject) => {
    const handlers = route.stack.map((item) => item.handle);
    const runNext = (index: number) => {
      const handler = handlers[index];
      if (!handler) return resolve();
      const maybe = handler(req as Request, res, () => runNext(index + 1));
      if (maybe && typeof (maybe as Promise<unknown>).then === 'function') {
        (maybe as Promise<unknown>).then(() => resolve(), reject);
      }
    };
    runNext(0);
  });
  return state;
}

const churchId = new Types.ObjectId();

function queryDoc(value: unknown) {
  return {
    select: async () => value,
  };
}

function pendingInvite(overrides: Record<string, unknown> = {}) {
  const publicId = createInvitePublicId();
  return {
    _id: new Types.ObjectId(),
    churchId,
    name: 'Maria Silva',
    email: 'maria@exemplo.com',
    publicId,
    version: 1,
    role: 'midia',
    permissions: [],
    permissionsCustomized: false,
    status: 'pending',
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('aceite público do convite', () => {
  test('aceite válido cria conta na igreja do convite', async () => {
    const invite = pendingInvite();
    const token = createInviteToken(invite.publicId, 1, String(churchId));
    stubMethod(TeamInvitation, 'findOne', async () => invite);
    stubMethod(Church, 'findOne', () => ({
      select: async () => ({ name: 'AD UMUARAMA' }),
    }));
    stubMethod(User, 'findOne', () => queryDoc(null));
    let createdChurch: unknown;
    stubMethod(mongoose, 'startSession', async () => ({
      withTransaction: async (fn: () => Promise<void>) => fn(),
      endSession: async () => undefined,
    }));
    stubMethod(TeamInvitation, 'findOneAndUpdate', async () => ({
      ...invite,
      status: 'accepted',
      save: async () => undefined,
    }));
    stubMethod(User, 'create', async (docs: Array<Record<string, unknown>>) => {
      createdChurch = docs[0]?.churchId;
      return [{ _id: new Types.ObjectId(), ...docs[0] }];
    });
    stubMethod(TeamAuditEvent, 'create', async () => ({}));

    const state = await run('post', '/:token/accept', {
      params: { token },
      body: { name: 'Maria Silva', password: 'secret12', confirmPassword: 'secret12' },
      query: {},
    });

    assert.equal(state.statusCode, 201);
    assert.equal(String(createdChurch), String(churchId));
    assert.equal(state.body.user.role, 'midia');
    assert.equal(state.body.user.churchName, 'AD UMUARAMA');
  });

  test('convite usado apenas uma vez', async () => {
    const invite = pendingInvite({ status: 'accepted' });
    const token = createInviteToken(invite.publicId, 1, String(churchId));
    stubMethod(TeamInvitation, 'findOne', async () => invite);
    stubMethod(Church, 'findOne', () => ({ select: async () => ({ name: 'AD' }) }));
    const state = await run('get', '/:token', { params: { token }, query: {} });
    assert.equal(state.statusCode, 410);
    assert.match(state.body.error, /já foi utilizado/);
  });

  test('convite expirado é recusado', async () => {
    const expired = pendingInvite({ expiresAt: new Date(Date.now() - 1000) });
    const expiredToken = createInviteToken(expired.publicId, 1, String(churchId));
    stubMethod(TeamInvitation, 'findOne', async () => expired);
    const expiredState = await run('get', '/:token', { params: { token: expiredToken }, query: {} });
    assert.equal(expiredState.statusCode, 410);
    assert.match(expiredState.body.error, /expirou/);
  });

  test('convite cancelado é recusado', async () => {
    const cancelled = pendingInvite({ status: 'cancelled' });
    const token = createInviteToken(cancelled.publicId, 1, String(churchId));
    stubMethod(TeamInvitation, 'findOne', async () => cancelled);
    const state = await run('get', '/:token', { params: { token }, query: {} });
    assert.equal(state.statusCode, 410);
    assert.match(state.body.error, /cancelado/);
  });

  test('convite sem e-mail aceita o e-mail informado na criação da conta', async () => {
    const invite = pendingInvite({ email: undefined });
    const token = createInviteToken(invite.publicId, 1, String(churchId));
    stubMethod(TeamInvitation, 'findOne', async () => invite);
    stubMethod(Church, 'findOne', () => ({ select: async () => ({ name: 'AD UMUARAMA' }) }));
    stubMethod(User, 'findOne', () => queryDoc(null));
    stubMethod(mongoose, 'startSession', async () => ({
      withTransaction: async (fn: () => Promise<void>) => fn(),
      endSession: async () => undefined,
    }));
    stubMethod(TeamInvitation, 'findOneAndUpdate', async () => ({
      ...invite,
      status: 'accepted',
      save: async () => undefined,
    }));
    stubMethod(User, 'create', async (docs: Array<Record<string, unknown>>) => [
      { _id: new Types.ObjectId(), ...docs[0] },
    ]);
    stubMethod(TeamAuditEvent, 'create', async () => ({}));

    const state = await run('post', '/:token/accept', {
      params: { token },
      body: {
        name: 'Maria Silva',
        email: 'maria@exemplo.com',
        password: 'secret12',
        confirmPassword: 'secret12',
      },
      query: {},
    });
    assert.equal(state.statusCode, 201);
    assert.equal(state.body.user.email, 'maria@exemplo.com');
  });

  test('e-mail do convite não pode ser trocado no aceite', async () => {
    const invite = pendingInvite();
    const token = createInviteToken(invite.publicId, 1, String(churchId));
    stubMethod(TeamInvitation, 'findOne', async () => invite);
    stubMethod(Church, 'findOne', () => ({ select: async () => ({ name: 'AD' }) }));
    stubMethod(User, 'findOne', () => queryDoc(null));
    const state = await run('post', '/:token/accept', {
      params: { token },
      body: {
        name: 'Maria',
        email: 'outra@exemplo.com',
        password: 'secret12',
        confirmPassword: 'secret12',
      },
      query: {},
    });
    assert.equal(state.statusCode, 400);
    assert.match(state.body.error, /vinculado a outro e-mail/);
  });

  test('e-mail de outra igreja não revela o nome dela', async () => {
    const invite = pendingInvite({ email: undefined });
    const token = createInviteToken(invite.publicId, 1, String(churchId));
    stubMethod(TeamInvitation, 'findOne', async () => invite);
    stubMethod(Church, 'findOne', () => ({ select: async () => ({ name: 'AD UMUARAMA' }) }));
    stubMethod(User, 'findOne', () =>
      queryDoc({
        churchId: new Types.ObjectId(),
        email: 'ana@outra.test',
      })
    );
    const state = await run('post', '/:token/accept', {
      params: { token },
      body: {
        name: 'Ana',
        email: 'ana@outra.test',
        password: 'secret12',
        confirmPassword: 'secret12',
      },
      query: {},
    });
    assert.equal(state.statusCode, 400);
    assert.equal(JSON.stringify(state.body).includes('outra'), false);
    assert.match(state.body.error, /Fale com o responsável/);
  });

  test('e-mail já usado na mesma igreja pede para entrar', async () => {
    const invite = pendingInvite();
    const token = createInviteToken(invite.publicId, 1, String(churchId));
    stubMethod(TeamInvitation, 'findOne', async () => invite);
    stubMethod(Church, 'findOne', () => ({ select: async () => ({ name: 'AD' }) }));
    stubMethod(User, 'findOne', () => queryDoc({ churchId, email: invite.email }));
    const state = await run('post', '/:token/accept', {
      params: { token },
      body: { name: 'Maria', password: 'secret12', confirmPassword: 'secret12' },
      query: {},
    });
    assert.equal(state.statusCode, 409);
    assert.match(state.body.error, /já faz parte/);
  });

  test('churchId no aceite é recusado', async () => {
    const invite = pendingInvite();
    const token = createInviteToken(invite.publicId, 1, String(churchId));
    const state = await run('post', '/:token/accept', {
      params: { token },
      body: { churchId: String(churchId), name: 'Maria', password: 'secret12', confirmPassword: 'secret12' },
      query: {},
    });
    assert.equal(state.statusCode, 400);
  });

  test('dois aceites simultâneos: o segundo encontra o convite consumido', async () => {
    const invite = pendingInvite();
    const token = createInviteToken(invite.publicId, 1, String(churchId));
    stubMethod(TeamInvitation, 'findOne', async () => invite);
    stubMethod(Church, 'findOne', () => ({ select: async () => ({ name: 'AD' }) }));
    stubMethod(User, 'findOne', () => queryDoc(null));
    stubMethod(mongoose, 'startSession', async () => ({
      withTransaction: async (fn: () => Promise<void>) => fn(),
      endSession: async () => undefined,
    }));
    stubMethod(TeamInvitation, 'findOneAndUpdate', async () => null);
    const state = await run('post', '/:token/accept', {
      params: { token },
      body: { name: 'Maria', password: 'secret12', confirmPassword: 'secret12' },
      query: {},
    });
    assert.equal(state.statusCode, 409);
  });
});
