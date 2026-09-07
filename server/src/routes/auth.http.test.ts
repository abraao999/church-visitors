import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { User } from '../models/User.js';
import {
  LOGIN_INVALID_ERROR,
  LOGIN_UNAVAILABLE_ERROR,
  MIN_PASSWORD_LENGTH,
  PASSWORD_TOO_SHORT,
  REGISTER_GENERIC_ERROR,
  changePassword,
  loginAccount,
  logoutAccount,
  registerAccount,
} from './auth.js';

process.env.JWT_SECRET = 'teste-jwt-enumeracao-conta-chave-longa-123456';
process.env.GUEST_ACCESS_SECRET = 'teste-guest-enumeracao-conta-chave-longa-654321';

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
  const state: {
    statusCode: number;
    body: unknown;
    cookies: Array<{ name: string; value?: string; cleared?: boolean }>;
  } = { statusCode: 200, body: undefined, cookies: [] };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
    cookie(name: string, value: string) {
      state.cookies.push({ name, value });
      return res;
    },
    clearCookie(name: string) {
      state.cookies.push({ name, cleared: true });
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

function registerBody(overrides: Record<string, unknown> = {}) {
  return {
    churchName: 'Igreja Teste',
    name: 'Ana Silva',
    email: 'ana@igreja.test',
    username: 'anasilva',
    password: 'secret12',
    ...overrides,
  };
}

describe('cadastro não revela se a conta já existe', () => {
  test('e-mail já cadastrado e e-mail novo inválido devolvem a mesma resposta', async () => {
    stubMethod(User, 'findOne', async () => ({ email: 'ana@igreja.test' }));

    const taken = mockRes();
    await registerAccount({ body: registerBody() }, taken.res);

    stubMethod(User, 'findOne', async () => null);
    const invalid = mockRes();
    await registerAccount({ body: registerBody({ email: 'nao-e-um-email' }) }, invalid.res);

    assert.equal(taken.state.statusCode, 400);
    assert.deepEqual(taken.state.body, invalid.state.body);
    assert.equal(taken.state.statusCode, invalid.state.statusCode);
    assert.deepEqual(taken.state.body, { error: REGISTER_GENERIC_ERROR });
    assert.equal(JSON.stringify(taken.state.body).includes('já cadastrado'), false);
  });

  test('usuário já usado usa a mesma recusa genérica', async () => {
    stubMethod(User, 'findOne', async () => ({ username: 'anasilva' }));
    const { res, state } = mockRes();
    await registerAccount({ body: registerBody({ email: 'nova@igreja.test' }) }, res);

    assert.equal(state.statusCode, 400);
    assert.deepEqual(state.body, { error: REGISTER_GENERIC_ERROR });
  });
});

describe('login não distingue estados da conta', () => {
  test('usuário inexistente e senha errada devolvem a mesma recusa', async () => {
    const passwordHash = await bcrypt.hash('senha-certa', 10);

    stubMethod(User, 'findOne', async () => null);
    const missing = mockRes();
    await loginAccount({ body: { login: 'sumida@igreja.test', password: 'qualquer' } }, missing.res);

    stubMethod(User, 'findOne', async () => ({
      passwordHash,
      churchId: new Types.ObjectId(),
    }));
    const wrong = mockRes();
    await loginAccount({ body: { login: 'ana@igreja.test', password: 'errada' } }, wrong.res);

    assert.equal(missing.state.statusCode, 401);
    assert.deepEqual(missing.state.body, wrong.state.body);
    assert.deepEqual(missing.state.body, { error: LOGIN_INVALID_ERROR });
  });

  test('o campo antigo email entra como o login', async () => {
    stubMethod(User, 'findOne', async () => null);
    const { res, state } = mockRes();
    await loginAccount({ body: { email: 'ana@igreja.test', password: 'qualquer' } }, res);
    assert.equal(state.statusCode, 401);
    assert.deepEqual(state.body, { error: LOGIN_INVALID_ERROR });
  });

  test('conta sem igreja e igreja inativa devolvem a mesma recusa', async () => {
    const passwordHash = await bcrypt.hash('senha-certa', 10);

    stubMethod(User, 'findOne', async () => ({
      passwordHash,
      name: 'Ana',
      email: 'ana@igreja.test',
    }));
    const noChurch = mockRes();
    await loginAccount({ body: { login: 'ana@igreja.test', password: 'senha-certa' } }, noChurch.res);

    const churchId = new Types.ObjectId();
    stubMethod(User, 'findOne', async () => ({
      _id: new Types.ObjectId(),
      passwordHash,
      churchId,
      name: 'Ana',
      email: 'ana@igreja.test',
      role: 'owner',
    }));
    stubMethod(Church, 'findOne', () => ({
      select: async () => null,
    }));
    const inactive = mockRes();
    await loginAccount({ body: { login: 'ana@igreja.test', password: 'senha-certa' } }, inactive.res);

    assert.equal(noChurch.state.statusCode, 403);
    assert.deepEqual(noChurch.state.body, inactive.state.body);
    assert.deepEqual(noChurch.state.body, { error: LOGIN_UNAVAILABLE_ERROR });
    assert.equal(JSON.stringify(noChurch.state.body).includes('vinculada'), false);
    assert.equal(JSON.stringify(inactive.state.body).includes('indisponível'), false);
  });
});

describe('senha e sessão', () => {
  test('cadastro recusa senha curta com a mesma regra da troca', async () => {
    const { res, state } = mockRes();
    await registerAccount({ body: registerBody({ password: '1234567' }) }, res);
    assert.equal(state.statusCode, 400);
    assert.deepEqual(state.body, { error: PASSWORD_TOO_SHORT });
    assert.equal(MIN_PASSWORD_LENGTH, 8);
  });

  test('troca de senha recusa a senha atual errada', async () => {
    const passwordHash = await bcrypt.hash('senha-certa', 10);
    stubMethod(User, 'findOne', async () => ({
      passwordHash,
      tokenVersion: 0,
      save: async () => undefined,
    }));

    const { res, state } = mockRes();
    await changePassword(
      {
        auth: {
          userId: new Types.ObjectId().toHexString(),
          churchId: new Types.ObjectId().toHexString(),
          role: 'owner',
          name: 'Ana',
          email: 'ana@igreja.test',
        },
        body: { currentPassword: 'errada', newPassword: 'novasenha1' },
      } as never,
      res
    );
    assert.equal(state.statusCode, 400);
    assert.deepEqual(state.body, { error: 'Senha atual incorreta' });
  });

  test('sair incrementa a versão do token', async () => {
    let received: Record<string, unknown> | undefined;
    stubMethod(User, 'updateOne', async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
      received = { filter, update };
      return { acknowledged: true };
    });

    const userId = new Types.ObjectId();
    const churchId = new Types.ObjectId();
    const { res, state } = mockRes();
    await logoutAccount(
      {
        auth: {
          userId: String(userId),
          churchId: String(churchId),
          role: 'owner',
          name: 'Ana',
          email: 'ana@igreja.test',
        },
      } as never,
      res
    );

    assert.equal(state.statusCode, 200);
    assert.deepEqual(state.body, { ok: true });
    assert.equal(String((received?.filter as { _id: unknown })._id), String(userId));
    assert.deepEqual(received?.update, { $inc: { tokenVersion: 1 } });
    assert.equal(state.cookies.some((cookie) => cookie.name === 'cv_session' && cookie.cleared), true);
  });
});
