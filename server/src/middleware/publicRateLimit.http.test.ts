import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { Response } from 'express';
import { Types } from 'mongoose';
import { requireGuestAccess, type GuestAccessRequest } from './guestAccess.js';
import { Church } from '../models/Church.js';
import { GuestAccess } from '../models/GuestAccess.js';
import { PublicRateLimit } from '../models/PublicRateLimit.js';
import { createGuestPublicId, createGuestToken } from '../utils/guestToken.js';

process.env.GUEST_ACCESS_SECRET = 'teste-guest-limite-publico-chave-longa-987654';
process.env.JWT_SECRET = 'teste-jwt-limite-publico-chave-longa-123456';

const churchA = new Types.ObjectId();
const churchB = new Types.ObjectId();

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

/** Substitui a coleção de limites por contadores em memória. */
function countingRateLimit() {
  const buckets = new Map<string, number>();
  stubMethod(
    PublicRateLimit,
    'findOneAndUpdate',
    async (filter: { _id: string }) => {
      const count = (buckets.get(filter._id) ?? 0) + 1;
      buckets.set(filter._id, count);
      return { count };
    }
  );
  return buckets;
}

function stubGuestAccess(churchId: Types.ObjectId) {
  const publicId = createGuestPublicId();
  const token = createGuestToken(publicId, 1);
  const accessId = new Types.ObjectId();

  stubMethod(GuestAccess, 'findOne', () => ({
    select: () => ({
      lean: async () => ({
        _id: accessId,
        churchId,
        name: 'Recepção',
        publicId,
        type: 'visitors:create',
        version: 1,
        active: true,
      }),
    }),
  }));

  stubMethod(Church, 'findOne', () => ({
    select: () => ({ lean: async () => ({ _id: churchId, name: 'Igreja' }) }),
  }));

  return { token, accessId };
}

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

async function submit(token: string, ip: string): Promise<number> {
  const req = {
    method: 'POST',
    params: { token },
    body: {},
    ip,
    socket: { remoteAddress: ip },
  } as unknown as GuestAccessRequest;
  const { res, state } = mockRes();
  let allowed = false;
  await requireGuestAccess('visitors:create')(req, res, () => {
    allowed = true;
  });
  return allowed ? 200 : state.statusCode;
}

describe('limite dos formulários públicos', () => {
  test('igreja que estourou o limite não bloqueia as outras', async () => {
    const buckets = countingRateLimit();
    const visitorIp = '203.0.113.10';

    const accessA = stubGuestAccess(churchA);
    for (let attempt = 1; attempt <= 40; attempt += 1) {
      assert.equal(await submit(accessA.token, visitorIp), 200, `envio ${attempt}`);
    }
    assert.equal(await submit(accessA.token, visitorIp), 429);

    // ip + church-ip da igreja A + acesso A
    assert.equal(buckets.size, 3);

    const accessB = stubGuestAccess(churchB);
    assert.equal(await submit(accessB.token, visitorIp), 200);

    // A igreja B recebeu contadores próprios, sem herdar o consumo da igreja A.
    assert.equal(buckets.size, 5);
  });

  test('mesmo IP em igrejas diferentes mantém contagens separadas', async () => {
    const buckets = countingRateLimit();
    const visitorIp = '203.0.113.20';

    const accessA = stubGuestAccess(churchA);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await submit(accessA.token, visitorIp);
    }

    const accessB = stubGuestAccess(churchB);
    await submit(accessB.token, visitorIp);

    const counts = [...buckets.values()].sort((a, b) => b - a);
    // O teto por IP soma os 6 envios; cada igreja conta o seu isoladamente.
    assert.deepEqual(counts, [6, 5, 5, 1, 1]);
  });

  test('varredura de links é barrada pelo teto por IP', async () => {
    countingRateLimit();
    const attackerIp = '198.51.100.7';

    let blockedAt = 0;
    for (let attempt = 1; attempt <= 320; attempt += 1) {
      const status = await submit('token-invalido', attackerIp);
      if (status === 429) {
        blockedAt = attempt;
        break;
      }
      assert.equal(status, 404, `tentativa ${attempt}`);
    }

    assert.equal(blockedAt, 301);
  });
});
