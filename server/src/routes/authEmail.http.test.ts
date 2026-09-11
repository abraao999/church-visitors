import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import bcrypt from 'bcryptjs';
import type { Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { EmailActionToken } from '../models/EmailActionToken.js';
import { PendingOwnerRegistration } from '../models/PendingOwnerRegistration.js';
import { User } from '../models/User.js';
import { EmailDeliveryError, setAuthEmailSender } from '../services/authEmail.js';
import {
  hashPasswordResetToken,
  hashVerificationCode,
  hashVerificationToken,
} from '../utils/emailCrypto.js';
import {
  REGISTER_GENERIC_ERROR,
  confirmOwnerEmail,
  forgotPasswordAccount,
  inspectPasswordReset,
  registerAccount,
  resendOwnerEmail,
  resetPasswordAccount,
} from './auth.js';

process.env.JWT_SECRET = 'teste-jwt-email-auth-chave-longa-1234567890ab';
process.env.GUEST_ACCESS_SECRET = 'teste-guest-email-auth-chave-longa-0987654321';
process.env.EMAIL_TOKEN_SECRET = 'teste-email-token-secret-chave-longa-abcdef';
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
  setAuthEmailSender(null);
});

function mockRes() {
  const state: {
    statusCode: number;
    body: unknown;
    cookies: Array<{ name: string; value?: string }>;
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
    clearCookie() {
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

function stubSession() {
  stubMethod(mongoose, 'startSession', async () => ({
    withTransaction: async (fn: () => Promise<void>) => fn(),
    endSession: async () => undefined,
  }));
}

describe('cadastro pendente do proprietário', () => {
  test('cadastro válido não cria igreja, usuário nem sessão', async () => {
    const sent: Array<Record<string, unknown>> = [];
    setAuthEmailSender({
      sendOwnerVerificationEmail: async (input) => {
        sent.push({ ...input });
      },
      sendPasswordResetEmail: async () => undefined,
    });
    stubMethod(User, 'findOne', async () => null);
    stubMethod(PendingOwnerRegistration, 'deleteMany', async () => ({ deletedCount: 0 }));
    let created: Record<string, unknown> | undefined;
    stubMethod(PendingOwnerRegistration, 'create', async (doc: Record<string, unknown>) => {
      created = doc;
      return [doc];
    });
    let churchCreated = false;
    stubMethod(Church, 'create', async () => {
      churchCreated = true;
      return [];
    });

    const { res, state } = mockRes();
    await registerAccount({ body: registerBody() }, res);

    assert.equal(state.statusCode, 201);
    const body = state.body as { pending: boolean; challengeId: string; emailMasked: string };
    assert.equal(body.pending, true);
    assert.ok(body.challengeId);
    assert.equal(body.emailMasked.includes('ana@igreja.test'), false);
    assert.equal(state.cookies.length, 0);
    assert.equal(churchCreated, false);
    assert.ok(created);
    assert.equal(String(created.passwordHash).includes('secret12'), false);
    assert.equal(sent.length, 1);
    assert.equal(JSON.stringify(created).includes(String(sent[0]?.token)), false);
    assert.equal(JSON.stringify(created).includes(String(sent[0]?.code)), false);
  });

  test('falha do Resend não expõe detalhes internos', async () => {
    setAuthEmailSender({
      sendOwnerVerificationEmail: async () => {
        throw new EmailDeliveryError();
      },
      sendPasswordResetEmail: async () => undefined,
    });
    stubMethod(User, 'findOne', async () => null);
    stubMethod(PendingOwnerRegistration, 'deleteMany', async () => ({ deletedCount: 0 }));
    stubMethod(PendingOwnerRegistration, 'create', async (doc: Record<string, unknown>) => [doc]);

    const { res, state } = mockRes();
    await registerAccount({ body: registerBody() }, res);
    const payload = JSON.stringify(state.body);
    assert.equal(state.statusCode, 503);
    assert.equal(payload.includes('resend'), false);
    assert.equal(payload.includes('RESEND'), false);
    assert.equal(payload.includes('api_key'), false);
    assert.equal(payload.includes('re_'), false);
  });

  test('contas existentes continuam com a recusa genérica', async () => {
    stubMethod(User, 'findOne', async () => ({ email: 'ana@igreja.test' }));
    const { res, state } = mockRes();
    await registerAccount({ body: registerBody() }, res);
    assert.equal(state.statusCode, 400);
    assert.deepEqual(state.body, { error: REGISTER_GENERIC_ERROR });
  });
});

describe('confirmação de e-mail', () => {
  test('confirmação válida cria uma igreja, define emailVerifiedAt e emite cookie', async () => {
    const token = 'token-alto-entropia-teste-confirmacao';
    const pendingId = new Types.ObjectId();
    const churchId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const pending = {
      _id: pendingId,
      churchName: 'Igreja Teste',
      name: 'Ana Silva',
      email: 'ana@igreja.test',
      username: 'anasilva',
      passwordHash: 'hash',
      verificationTokenHash: hashVerificationToken(token),
      verificationExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      consumedAt: null,
      attemptCount: 0,
    };

    stubMethod(PendingOwnerRegistration, 'findOne', async () => pending);
    stubSession();
    stubMethod(PendingOwnerRegistration, 'findOneAndUpdate', async () => pending);
    stubMethod(User, 'findOne', async () => null);
    stubMethod(Church, 'create', async () => [{ _id: churchId, name: 'Igreja Teste' }]);
    stubMethod(User, 'create', async (docs: Array<Record<string, unknown>>) => {
      assert.ok(docs[0]?.emailVerifiedAt);
      return [{ _id: userId, ...docs[0], tokenVersion: 0 }];
    });
    stubMethod(PendingOwnerRegistration, 'deleteOne', async () => ({ deletedCount: 1 }));

    const { res, state } = mockRes();
    await confirmOwnerEmail({ body: { token } }, res);
    const body = state.body as { user: { email: string } };
    assert.equal(state.statusCode, 201);
    assert.equal(body.user.email, 'ana@igreja.test');
    assert.equal(state.cookies.some((cookie) => cookie.name === 'cv_session' && cookie.value), true);
  });

  test('token e código expirados são recusados', async () => {
    stubMethod(PendingOwnerRegistration, 'findOne', async () => ({
      verificationTokenHash: hashVerificationToken('velho'),
      verificationExpiresAt: new Date(Date.now() - 1000),
      consumedAt: null,
      attemptCount: 0,
    }));
    const expiredToken = mockRes();
    await confirmOwnerEmail({ body: { token: 'velho' } }, expiredToken.res);
    assert.equal(expiredToken.state.statusCode, 400);
    assert.equal((expiredToken.state.body as { code: string }).code, 'expired');

    stubMethod(PendingOwnerRegistration, 'findOne', async () => ({
      challengeId: 'abc',
      verificationCodeHash: hashVerificationCode('abc', '123456'),
      verificationExpiresAt: new Date(Date.now() - 1000),
      consumedAt: null,
      attemptCount: 0,
    }));
    const expiredCode = mockRes();
    await confirmOwnerEmail({ body: { challengeId: 'abc', code: '123456' } }, expiredCode.res);
    assert.equal((expiredCode.state.body as { code: string }).code, 'expired');
  });

  test('código incorreto incrementa tentativas e o excesso bloqueia', async () => {
    const pending = {
      _id: new Types.ObjectId(),
      challengeId: 'abc',
      verificationCodeHash: hashVerificationCode('abc', '123456'),
      verificationExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      consumedAt: null,
      attemptCount: 4,
    };
    stubMethod(PendingOwnerRegistration, 'findOne', async () => pending);
    stubMethod(PendingOwnerRegistration, 'findOneAndUpdate', async () => ({
      ...pending,
      attemptCount: 5,
    }));
    const { res, state } = mockRes();
    await confirmOwnerEmail({ body: { challengeId: 'abc', code: '000000' } }, res);
    assert.equal((state.body as { code: string }).code, 'too_many');
  });

  test('dois cliques simultâneos não criam duas igrejas', async () => {
    const token = 'token-duplo-clique';
    const pending = {
      _id: new Types.ObjectId(),
      churchName: 'Igreja Teste',
      name: 'Ana',
      email: 'ana@igreja.test',
      username: 'anasilva',
      passwordHash: 'hash',
      verificationTokenHash: hashVerificationToken(token),
      verificationExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      consumedAt: null,
      attemptCount: 0,
    };
    stubMethod(PendingOwnerRegistration, 'findOne', async () => pending);
    stubSession();
    let claims = 0;
    stubMethod(PendingOwnerRegistration, 'findOneAndUpdate', async () => {
      claims += 1;
      return claims === 1 ? pending : null;
    });
    stubMethod(User, 'findOne', async () => null);
    let churches = 0;
    stubMethod(Church, 'create', async () => {
      churches += 1;
      return [{ _id: new Types.ObjectId(), name: 'Igreja Teste' }];
    });
    stubMethod(User, 'create', async () => [{ _id: new Types.ObjectId(), tokenVersion: 0, email: 'ana@igreja.test', name: 'Ana', username: 'anasilva' }]);
    stubMethod(PendingOwnerRegistration, 'deleteOne', async () => ({ deletedCount: 1 }));

    const first = mockRes();
    const second = mockRes();
    await confirmOwnerEmail({ body: { token } }, first.res);
    await confirmOwnerEmail({ body: { token } }, second.res);
    assert.equal(first.state.statusCode, 201);
    assert.equal((second.state.body as { code: string }).code, 'used');
    assert.equal(churches, 1);
  });

  test('churchId enviado pelo cliente é recusado', async () => {
    const { res, state } = mockRes();
    await confirmOwnerEmail({ body: { token: 'abc', churchId: 'x' } }, res);
    assert.equal(state.statusCode, 400);
    assert.equal(JSON.stringify(state.body).includes('igreja'), true);
  });

  test('reenvio invalida o token anterior e respeita o intervalo', async () => {
    const sent: string[] = [];
    setAuthEmailSender({
      sendOwnerVerificationEmail: async (input) => {
        sent.push(input.token);
      },
      sendPasswordResetEmail: async () => undefined,
    });
    const pending = {
      _id: new Types.ObjectId(),
      challengeId: 'abc',
      email: 'ana@igreja.test',
      username: 'anasilva',
      name: 'Ana',
      churchName: 'Igreja',
      resendAvailableAt: new Date(Date.now() - 1000),
      consumedAt: null,
    };
    stubMethod(PendingOwnerRegistration, 'findOne', async () => pending);
    stubMethod(User, 'findOne', async () => null);
    let updatedHash: string | undefined;
    stubMethod(PendingOwnerRegistration, 'findOneAndUpdate', async (_filter: unknown, update: { $set: { verificationTokenHash: string } }) => {
      updatedHash = update.$set.verificationTokenHash;
      return { ...pending, ...update.$set };
    });

    const ok = mockRes();
    await resendOwnerEmail({ body: { challengeId: 'abc' } }, ok.res);
    assert.equal(ok.state.statusCode, 200);
    assert.equal(sent.length, 1);
    assert.equal(updatedHash, hashVerificationToken(sent[0]));

    pending.resendAvailableAt = new Date(Date.now() + 30_000);
    const wait = mockRes();
    await resendOwnerEmail({ body: { challengeId: 'abc' } }, wait.res);
    assert.equal(wait.state.statusCode, 429);
  });
});

describe('redefinição de senha', () => {
  test('e-mail existente e inexistente recebem a mesma resposta pública', async () => {
    setAuthEmailSender({
      sendOwnerVerificationEmail: async () => undefined,
      sendPasswordResetEmail: async () => undefined,
    });
    stubMethod(User, 'findOne', async () => null);
    const missing = mockRes();
    await forgotPasswordAccount({ body: { email: 'sumida@igreja.test' } }, missing.res);

    const passwordHash = await bcrypt.hash('secret12', 10);
    stubMethod(User, 'findOne', async () => ({
      _id: new Types.ObjectId(),
      name: 'Ana',
      email: 'ana@igreja.test',
      passwordHash,
      churchId: new Types.ObjectId(),
      active: true,
    }));
    stubMethod(Church, 'findOne', async () => ({ name: 'Igreja Teste' }));
    stubMethod(EmailActionToken, 'updateMany', async () => ({ modifiedCount: 0 }));
    stubMethod(EmailActionToken, 'create', async () => [{ _id: new Types.ObjectId() }]);

    const existing = mockRes();
    await forgotPasswordAccount({ body: { email: 'ana@igreja.test' } }, existing.res);
    assert.equal(missing.state.statusCode, existing.state.statusCode);
    assert.deepEqual(missing.state.body, existing.state.body);
    assert.equal(
      (missing.state.body as { message: string }).message,
      'Se existir uma conta para este e-mail, enviaremos as instruções.'
    );
  });

  test('conta ou igreja inativa não é revelada e o cliente não escolhe a igreja', async () => {
    stubMethod(User, 'findOne', async () => ({
      _id: new Types.ObjectId(),
      email: 'ana@igreja.test',
      passwordHash: 'hash',
      churchId: new Types.ObjectId(),
      active: false,
    }));
    const inactive = mockRes();
    await forgotPasswordAccount({ body: { email: 'ana@igreja.test' } }, inactive.res);
    assert.deepEqual(inactive.state.body, {
      message: 'Se existir uma conta para este e-mail, enviaremos as instruções.',
    });

    const tenant = mockRes();
    await forgotPasswordAccount({ body: { email: 'ana@igreja.test', churchId: 'x' } }, tenant.res);
    assert.equal(tenant.state.statusCode, 400);
  });

  test('token fica vinculado ao usuário e à igreja e não altera outra igreja', async () => {
    const token = 'token-reset-isolamento';
    const userId = new Types.ObjectId();
    const churchId = new Types.ObjectId();
    const otherChurch = new Types.ObjectId();
    stubMethod(EmailActionToken, 'findOne', async () => ({
      _id: new Types.ObjectId(),
      purpose: 'password_reset',
      userId,
      churchId,
      tokenHash: hashPasswordResetToken(token),
      usedAt: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    }));
    stubMethod(User, 'findOne', async (filter: { churchId?: Types.ObjectId }) => {
      if (filter.churchId && String(filter.churchId) !== String(churchId)) return null;
      return {
        _id: userId,
        churchId,
        active: true,
        passwordHash: await bcrypt.hash('secret12', 10),
        tokenVersion: 0,
        emailVerifiedAt: undefined,
        save: async () => undefined,
      };
    });
    stubMethod(Church, 'findOne', async () => ({ _id: churchId }));

    const inspect = mockRes();
    await inspectPasswordReset({ body: { token, churchId: String(otherChurch), userId: String(userId) } }, inspect.res);
    assert.equal(inspect.state.statusCode, 400);

    const rejected = mockRes();
    await resetPasswordAccount(
      { body: { token, newPassword: 'novasenha1', confirmPassword: 'novasenha1', userId: String(userId) } },
      rejected.res
    );
    assert.equal(rejected.state.statusCode, 400);

    stubSession();
    let userFilter: { _id?: Types.ObjectId; churchId?: Types.ObjectId } | undefined;
    stubMethod(User, 'findOne', async (filter: { _id?: Types.ObjectId; churchId?: Types.ObjectId }) => {
      userFilter = filter;
      if (String(filter.churchId) !== String(churchId) || String(filter._id) !== String(userId)) {
        return null;
      }
      return {
        _id: userId,
        churchId,
        active: true,
        passwordHash: await bcrypt.hash('secret12', 10),
        tokenVersion: 0,
        save: async () => undefined,
      };
    });
    stubMethod(Church, 'findOne', async () => ({ _id: churchId }));
    stubMethod(EmailActionToken, 'findOneAndUpdate', async (filter: { churchId: Types.ObjectId; userId: Types.ObjectId }) => {
      assert.equal(String(filter.churchId), String(churchId));
      assert.equal(String(filter.userId), String(userId));
      return { _id: new Types.ObjectId(), userId, churchId };
    });
    stubMethod(EmailActionToken, 'updateMany', async () => ({ modifiedCount: 0 }));

    const reset = mockRes();
    await resetPasswordAccount(
      { body: { token, newPassword: 'novasenha1', confirmPassword: 'novasenha1' } },
      reset.res
    );
    assert.equal(reset.state.statusCode, 200);
    assert.equal(String(userFilter?._id), String(userId));
    assert.equal(String(userFilter?.churchId), String(churchId));
    assert.equal(String(otherChurch) === String(churchId), false);
  });

  test('token expirado ou usado é recusado e a senha atual não pode ser reutilizada', async () => {
    const token = 'token-reset-regras';
    stubMethod(EmailActionToken, 'findOne', async () => ({
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      userId: new Types.ObjectId(),
      churchId: new Types.ObjectId(),
    }));
    const used = mockRes();
    await resetPasswordAccount(
      { body: { token, newPassword: 'novasenha1', confirmPassword: 'novasenha1' } },
      used.res
    );
    assert.equal((used.state.body as { code: string }).code, 'used');

    stubMethod(EmailActionToken, 'findOne', async () => ({
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      userId: new Types.ObjectId(),
      churchId: new Types.ObjectId(),
    }));
    const expired = mockRes();
    await resetPasswordAccount(
      { body: { token, newPassword: 'novasenha1', confirmPassword: 'novasenha1' } },
      expired.res
    );
    assert.equal((expired.state.body as { code: string }).code, 'expired');

    const passwordHash = await bcrypt.hash('secret12', 10);
    const userId = new Types.ObjectId();
    const churchId = new Types.ObjectId();
    stubMethod(EmailActionToken, 'findOne', async () => ({
      _id: new Types.ObjectId(),
      usedAt: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      userId,
      churchId,
    }));
    stubMethod(User, 'findOne', async () => ({
      _id: userId,
      churchId,
      active: true,
      passwordHash,
      tokenVersion: 2,
      emailVerifiedAt: undefined,
    }));
    stubMethod(Church, 'findOne', async () => ({ _id: churchId }));
    const same = mockRes();
    await resetPasswordAccount(
      { body: { token, newPassword: 'secret12', confirmPassword: 'secret12' } },
      same.res
    );
    assert.equal((same.state.body as { code: string }).code, 'same');
  });

  test('reset bem-sucedido atualiza hash, preenche emailVerifiedAt e incrementa tokenVersion', async () => {
    const token = 'token-reset-sucesso';
    const userId = new Types.ObjectId();
    const churchId = new Types.ObjectId();
    const passwordHash = await bcrypt.hash('secret12', 10);
    const user = {
      _id: userId,
      churchId,
      active: true,
      passwordHash,
      tokenVersion: 3,
      emailVerifiedAt: undefined as Date | undefined,
      save: async function save(this: { passwordHash: string; tokenVersion: number; emailVerifiedAt?: Date }) {
        return this;
      },
    };
    stubMethod(EmailActionToken, 'findOne', async () => ({
      _id: new Types.ObjectId(),
      usedAt: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      userId,
      churchId,
    }));
    stubMethod(User, 'findOne', async () => user);
    stubMethod(Church, 'findOne', async () => ({ _id: churchId }));
    stubSession();
    stubMethod(EmailActionToken, 'findOneAndUpdate', async () => ({
      _id: new Types.ObjectId(),
      userId,
      churchId,
    }));
    stubMethod(EmailActionToken, 'updateMany', async () => ({ modifiedCount: 1 }));

    const { res, state } = mockRes();
    await resetPasswordAccount(
      { body: { token, newPassword: 'novasenha1', confirmPassword: 'novasenha1' } },
      res
    );
    assert.equal(state.statusCode, 200);
    assert.deepEqual(state.body, { ok: true });
    assert.equal(state.cookies.length, 0);
    assert.equal(user.tokenVersion, 4);
    assert.ok(user.emailVerifiedAt);
    assert.notEqual(user.passwordHash, passwordHash);
  });
});
