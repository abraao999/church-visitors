import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import teamRouter from './team.js';
import { TeamInvitation } from '../models/TeamInvitation.js';
import { User } from '../models/User.js';
import { Church } from '../models/Church.js';
import { TeamAuditEvent } from '../models/TeamAuditEvent.js';
import { permissionsForRole } from '../utils/permissions.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

process.env.JWT_SECRET = 'teste-jwt-equipe-igreja-chave-longa-1234567890';
process.env.GUEST_ACCESS_SECRET = 'teste-guest-equipe-igreja-chave-longa-0987654321';

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
    setHeader() {
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

const churchA = new Types.ObjectId();
const churchB = new Types.ObjectId();
const ownerA = new Types.ObjectId();

function ownerReq(overrides: Record<string, unknown> = {}): AuthenticatedRequest {
  return {
    auth: {
      userId: String(ownerA),
      churchId: String(churchA),
      role: 'owner',
      name: 'Abraão',
      email: 'acscartorio@gmail.com',
      permissions: permissionsForRole('owner'),
    },
    query: {},
    params: {},
    body: {},
    headers: {},
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: Request, res: Response, next: NextFunction) => unknown }>;
  };
};

function routeLayer(
  method: 'get' | 'post' | 'patch',
  path: string
): NonNullable<Layer['route']> {
  const stack = (teamRouter as unknown as { stack: Layer[] }).stack;
  const layer = stack.find((item) => item.route?.path === path && item.route.methods[method]);
  assert.ok(layer?.route, `rota ${method.toUpperCase()} ${path} não encontrada`);
  return layer.route;
}

async function runRoute(
  method: 'get' | 'post' | 'patch',
  path: string,
  req: AuthenticatedRequest
) {
  const route = routeLayer(method, path);
  const { res, state } = mockRes();
  await new Promise<void>((resolve, reject) => {
    const handlers = route.stack.map((item) => item.handle);
    const runNext = (index: number) => {
      const handler = handlers[index];
      if (!handler) {
        resolve();
        return;
      }
      try {
        const maybe = handler(req, res, () => runNext(index + 1));
        if (maybe && typeof (maybe as Promise<unknown>).then === 'function') {
          (maybe as Promise<unknown>).then(() => resolve(), reject);
        }
      } catch (error) {
        reject(error);
      }
    };
    runNext(0);
  });
  return state;
}

describe('convites e isolamento da equipe', () => {
  test('criação de convite fica na igreja da sessão e devolve só o endereço', async () => {
    stubMethod(User, 'findOne', () => ({
      select: async () => null,
    }));
    stubMethod(TeamInvitation, 'findOne', async () => null);
    stubMethod(TeamInvitation, 'create', async (doc: Record<string, unknown>) => ({
      ...doc,
      _id: new Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    stubMethod(TeamAuditEvent, 'create', async () => ({}));

    const state = await runRoute('post', '/invitations', ownerReq({
      body: { name: 'Maria Silva', email: 'maria@exemplo.com', role: 'midia', ttlDays: 7 },
    }));

    assert.equal(state.statusCode, 201);
    assert.equal(state.body.role, 'midia');
    assert.match(state.body.path, /^\/convite\//);
    assert.equal(typeof state.body.path.split('/')[2], 'string');
    assert.equal('token' in state.body, false);
  });

  test('proprietário lista somente a equipe da própria igreja', async () => {
    let memberFilter: Record<string, unknown> | undefined;
    stubMethod(User, 'find', (filter: Record<string, unknown>) => {
      memberFilter = filter;
      return {
        select() {
          return this;
        },
        sort() {
          return this;
        },
        lean: async () => [
          {
            _id: ownerA,
            name: 'Abraão',
            email: 'a@a.com',
            role: 'owner',
            churchId: churchA,
            active: true,
          },
        ],
      };
    });
    stubMethod(TeamInvitation, 'find', () => ({
      sort: async () => [],
    }));
    stubMethod(Church, 'findById', () => ({
      select: async () => ({ name: 'AD UMUARAMA' }),
    }));

    const state = await runRoute('get', '/', ownerReq());
    assert.equal(state.statusCode, 200);
    assert.equal(String(memberFilter?.churchId), String(churchA));
    assert.notEqual(String(memberFilter?.churchId), String(churchB));
    assert.equal(state.body.members.length, 1);
    assert.equal(state.body.members[0].you, true);
  });

  test('tentativa de alterar integrante de outra igreja responde 404', async () => {
    stubMethod(User, 'findOne', async () => null);
    const otherId = new Types.ObjectId().toHexString();
    const state = await runRoute(
      'patch',
      '/members/:id',
      ownerReq({ params: { id: otherId }, body: { role: 'portaria' } })
    );
    assert.equal(state.statusCode, 404);
  });

  test('administrador não edita o proprietário', async () => {
    const ownerId = new Types.ObjectId();
    stubMethod(User, 'findOne', async () => ({
      _id: ownerId,
      churchId: churchA,
      role: 'owner',
      name: 'Abraão',
      email: 'a@a.com',
    }));
    const adminReq = ownerReq({
      auth: {
        userId: new Types.ObjectId().toHexString(),
        churchId: String(churchA),
        role: 'admin',
        name: 'Ana',
        email: 'ana@igreja.test',
        permissions: permissionsForRole('admin'),
      },
      params: { id: ownerId.toHexString() },
      body: { role: 'portaria' },
    });
    const state = await runRoute('patch', '/members/:id', adminReq);
    assert.equal(state.statusCode, 403);
  });

  test('renovar convite incrementa a versão e invalida o link anterior', async () => {
    const publicId = 'abcdefghijklmnopqrstuvwx01234567';
    const invite = {
      _id: new Types.ObjectId(),
      churchId: churchA,
      name: 'Maria',
      publicId,
      version: 1,
      role: 'midia',
      permissions: [],
      permissionsCustomized: false,
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      async save() {
        return this;
      },
    };
    stubMethod(TeamInvitation, 'findOne', async () => invite);
    stubMethod(TeamAuditEvent, 'create', async () => ({}));

    const state = await runRoute(
      'post',
      '/invitations/:id/renew',
      ownerReq({ params: { id: String(invite._id) }, body: { ttlDays: 7 } })
    );
    assert.equal(state.statusCode, 200);
    assert.equal(invite.version, 2);
    assert.match(state.body.path, /^\/convite\//);
  });
});
