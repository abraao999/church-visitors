import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { Request, Response } from 'express';
import { PublicRateLimit } from '../models/PublicRateLimit.js';
import {
  LOGIN_ID_LIMIT,
  LOGIN_IP_LIMIT,
  REGISTER_IP_LIMIT,
  requireAuthRateLimit,
} from './authRateLimit.js';

process.env.JWT_SECRET = 'teste-jwt-limite-login-chave-longa-123456';
process.env.GUEST_ACCESS_SECRET = 'teste-guest-limite-login-chave-longa-654321';

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

function countingRateLimit() {
  const buckets = new Map<string, number>();
  stubMethod(PublicRateLimit, 'findOneAndUpdate', async (filter: { _id: string }) => {
    const count = (buckets.get(filter._id) ?? 0) + 1;
    buckets.set(filter._id, count);
    return { count };
  });
  return buckets;
}

function mockRes() {
  const state: { statusCode: number; body: unknown; retryAfter?: string } = {
    statusCode: 200,
    body: undefined,
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
      if (name === 'Retry-After') state.retryAfter = value;
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

async function hit(
  action: 'login' | 'register',
  ip: string,
  body: Record<string, unknown>
): Promise<number> {
  const req = {
    method: 'POST',
    ip,
    socket: { remoteAddress: ip },
    body,
  } as unknown as Request;
  const { res, state } = mockRes();
  let allowed = false;
  await requireAuthRateLimit(action)(req, res, () => {
    allowed = true;
  });
  return allowed ? 200 : state.statusCode;
}

describe('limite de tentativas no login e no cadastro', () => {
  test('o mesmo IP é bloqueado após 20 tentativas de login', async () => {
    countingRateLimit();
    const ip = '203.0.113.40';

    for (let attempt = 1; attempt <= LOGIN_IP_LIMIT; attempt += 1) {
      assert.equal(await hit('login', ip, { login: `user${attempt}` }), 200, `login ${attempt}`);
    }
    assert.equal(await hit('login', ip, { login: 'outro' }), 429);
  });

  test('a mesma conta é bloqueada após 10 tentativas, mesmo com IPs diferentes', async () => {
    countingRateLimit();
    const login = 'responsavel@igreja.test';

    for (let attempt = 1; attempt <= LOGIN_ID_LIMIT; attempt += 1) {
      assert.equal(
        await hit('login', `198.51.100.${attempt}`, { login }),
        200,
        `ip ${attempt}`
      );
    }
    assert.equal(await hit('login', '198.51.100.200', { login }), 429);
  });

  test('estourar o limite de uma conta não impede outra conta no mesmo IP', async () => {
    countingRateLimit();
    const ip = '203.0.113.50';

    for (let attempt = 1; attempt <= LOGIN_ID_LIMIT; attempt += 1) {
      await hit('login', ip, { login: 'alvo@igreja.test' });
    }
    assert.equal(await hit('login', ip, { login: 'alvo@igreja.test' }), 429);
    assert.equal(await hit('login', ip, { login: 'outra@igreja.test' }), 200);
  });

  test('cadastro pelo mesmo IP é bloqueado após 10 tentativas', async () => {
    countingRateLimit();
    const ip = '203.0.113.60';

    for (let attempt = 1; attempt <= REGISTER_IP_LIMIT; attempt += 1) {
      assert.equal(await hit('register', ip, {}), 200, `cadastro ${attempt}`);
    }
    assert.equal(await hit('register', ip, {}), 429);
    assert.equal(await hit('register', '203.0.113.61', {}), 200);
  });
});
