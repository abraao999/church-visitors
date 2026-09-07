import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { Response } from 'express';
import { Types } from 'mongoose';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { PortariaDevice } from '../models/PortariaDevice.js';
import { listPortariaDevices, revokePortariaDevice } from './portariaDevices.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env.GUEST_ACCESS_SECRET = 'teste-guest-portaria-admin-chave-longa-654321';
process.env.JWT_SECRET = 'teste-jwt-portaria-admin-chave-longa-123456ab';

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

function authReq(churchId: string, id?: string) {
  return {
    auth: {
      userId: String(new Types.ObjectId()),
      churchId,
      role: 'owner',
      name: 'Dono',
      email: 'dono@igreja.test',
      permissions: ['portaria_devices:read', 'portaria_devices:revoke'],
    },
    params: { id },
  } as unknown as AuthenticatedRequest;
}

test('listagem administrativa só devolve aparelhos da igreja da sessão', async () => {
  const churchA = new Types.ObjectId();
  const seen: unknown[] = [];
  stubMethod(PortariaDevice, 'find', (filter: Record<string, unknown>) => {
    seen.push(filter);
    return {
      sort: () => ({
        lean: async () => [],
      }),
    };
  });

  const { res } = mockRes();
  await listPortariaDevices(authReq(String(churchA)), res);
  assert.deepEqual(seen[0], { churchId: churchA });
});

test('revogação de aparelho de outra igreja não encontra o registro', async () => {
  stubMethod(PortariaDevice, 'findOneAndUpdate', async () => null);
  const { res, state } = mockRes();
  await revokePortariaDevice(authReq(String(new Types.ObjectId()), String(new Types.ObjectId())), res);
  assert.equal(state.statusCode, 404);
});

test('a API do aparelho não expõe listagens privadas', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'portaria.js'), 'utf8');
  assert.equal(source.includes("router.get('/visitors'"), false);
  assert.equal(source.includes("router.get('/vehicle-notices'"), false);
  assert.equal(source.includes('prayer-requests'), false);
});
