import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { Response } from 'express';
import { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { requirePermission } from '../middleware/requirePermission.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { permissionsForRole } from '../utils/permissions.js';
import {
  createMemoryLogoStore,
  setBrandingLogoStoreForTests,
} from '../services/brandingLogoStore.js';
import { MAX_LOGO_BYTES } from '../utils/branding.js';
import {
  deleteChurchLogo,
  getChurchBranding,
  patchChurchBranding,
  postChurchLogo,
} from './churchBranding.js';

process.env.JWT_SECRET = 'teste-jwt-identidade-visual-chave-longa-123456';
process.env.GUEST_ACCESS_SECRET = 'teste-guest-identidade-visual-chave-longa-654321';

const churchA = new Types.ObjectId();
const churchB = new Types.ObjectId();
const userA = new Types.ObjectId();

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);

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
  setBrandingLogoStoreForTests(null);
});

function mockRes() {
  const state: { statusCode: number; body: Record<string, unknown> | undefined } = {
    statusCode: 200,
    body: undefined,
  };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: Record<string, unknown>) {
      state.body = payload;
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

function authReq(
  extras: Partial<AuthenticatedRequest> & { role?: 'owner' | 'admin' | 'portaria' | 'midia' } = {}
): AuthenticatedRequest {
  const role = extras.role || 'owner';
  return {
    auth: {
      userId: String(userA),
      churchId: String(churchA),
      role,
      name: 'Ana',
      email: 'ana@igreja.test',
      permissions: permissionsForRole(role),
    },
    query: {},
    params: {},
    body: {},
    ...extras,
  } as AuthenticatedRequest;
}

function churchDoc(id: Types.ObjectId, extras: Record<string, unknown> = {}) {
  const doc = {
    _id: id,
    name: id.equals(churchA) ? 'Igreja Alfa' : 'Igreja Beta',
    active: true,
    branding: undefined as Record<string, unknown> | undefined,
    markModified() {
      return undefined;
    },
    async save() {
      return doc;
    },
    ...extras,
  };
  return doc;
}

describe('isolamento da identidade visual', () => {
  test('igreja A não lê a identidade da igreja B', async () => {
    stubMethod(Church, 'findById', async (id: unknown) => {
      if (String(id) === String(churchB)) {
        return churchDoc(churchB, {
          branding: { logoUrl: 'https://secret.beta/logo.png', primaryColor: '#111111' },
        });
      }
      return churchDoc(churchA);
    });

    const { res, state } = mockRes();
    await getChurchBranding(authReq(), res);
    assert.equal(state.statusCode, 200);
    assert.equal(state.body?.name, 'Igreja Alfa');
    assert.equal(state.body?.logoUrl, undefined);
    assert.equal(JSON.stringify(state.body).includes('secret.beta'), false);
    assert.equal('logoStorageKey' in (state.body || {}), false);
    assert.equal('address' in (state.body || {}), false);
    assert.equal('churchId' in (state.body || {}), false);
  });

  test('churchId enviado pelo cliente é recusado e a igreja B não muda', async () => {
    let savedB = false;
    stubMethod(Church, 'findById', async (id: unknown) => {
      if (String(id) === String(churchB)) {
        return churchDoc(churchB, {
          async save() {
            savedB = true;
            return this;
          },
        });
      }
      return churchDoc(churchA);
    });

    const { res, state } = mockRes();
    await patchChurchBranding(
      authReq({ body: { churchId: String(churchB), primaryColor: '#2563EB' } }),
      res
    );
    assert.equal(state.statusCode, 400);
    assert.match(String(state.body?.error), /identificador da igreja/i);
    assert.equal(savedB, false);
  });

  test('usuário sem church:update recebe acesso negado', () => {
    const { res, state } = mockRes();
    let nextCalled = false;
    requirePermission('church:update')(authReq({ role: 'portaria' }), res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(state.statusCode, 403);
  });
});

describe('validação de identidade visual', () => {
  test('igreja antiga sem branding usa a identidade padrão', async () => {
    stubMethod(Church, 'findById', async () => churchDoc(churchA));
    const { res, state } = mockRes();
    await getChurchBranding(authReq(), res);
    assert.equal(state.statusCode, 200);
    assert.deepEqual(state.body, { name: 'Igreja Alfa', updatedAt: undefined });
  });

  test('cores inválidas são rejeitadas', async () => {
    stubMethod(Church, 'findById', async () => churchDoc(churchA));
    const { res, state } = mockRes();
    await patchChurchBranding(authReq({ body: { primaryColor: '#FFF' } }), res);
    assert.equal(state.statusCode, 400);
    assert.match(String(state.body?.error), /hexadecimal/i);
  });

  test('SVG e arquivo maior que 2 MB são rejeitados', async () => {
    stubMethod(Church, 'findById', async () => churchDoc(churchA));

    const svg = mockRes();
    await postChurchLogo(
      authReq({
        file: {
          buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
          mimetype: 'image/png',
          originalname: 'logo.png',
          size: 40,
        },
      } as never),
      svg.res
    );
    assert.equal(svg.state.statusCode, 400);
    assert.match(String(svg.state.body?.error), /PNG, JPEG ou WebP|SVG/i);

    const namedSvg = mockRes();
    await postChurchLogo(
      authReq({
        file: {
          buffer: Buffer.from('<svg></svg>'),
          mimetype: 'image/svg+xml',
          originalname: 'marca.svg',
          size: 20,
        },
      } as never),
      namedSvg.res
    );
    assert.equal(namedSvg.state.statusCode, 400);
    assert.match(String(namedSvg.state.body?.error), /SVG/i);

    const huge = mockRes();
    await postChurchLogo(
      authReq({
        file: {
          buffer: Buffer.alloc(MAX_LOGO_BYTES + 1, 1),
          mimetype: 'image/png',
          originalname: 'logo.png',
          size: MAX_LOGO_BYTES + 1,
        },
      } as never),
      huge.res
    );
    assert.equal(huge.state.statusCode, 400);
    assert.match(String(huge.state.body?.error), /2 MB/i);
  });
});

describe('troca e remoção do logotipo', () => {
  test('substitui o arquivo só depois de atualizar o banco', async () => {
    const memory = createMemoryLogoStore();
    setBrandingLogoStoreForTests(memory);
    let savedKey = 'old-key';
    const church = churchDoc(churchA, {
      branding: {
        logoUrl: 'https://blob.test/old.png',
        logoStorageKey: 'old-key',
      },
      async save() {
        savedKey = String(church.branding?.logoStorageKey);
        return church;
      },
    });
    stubMethod(Church, 'findById', async () => church);

    const originalDelete = memory.delete.bind(memory);
    memory.delete = async (key) => {
      assert.notEqual(savedKey, 'old-key');
      await originalDelete(key);
    };

    const { res, state } = mockRes();
    await postChurchLogo(
      authReq({
        file: { buffer: PNG, mimetype: 'image/png', originalname: 'novo.png', size: PNG.length },
      } as never),
      res
    );

    assert.equal(state.statusCode, 200);
    assert.match(String(state.body?.logoUrl), /blob\.test/);
    assert.equal('logoStorageKey' in (state.body || {}), false);
    assert.equal(savedKey.startsWith('church-branding/'), true);
    assert.ok(savedKey.includes(String(churchA)));
    assert.equal(memory.events[0]?.startsWith('put:'), true);
    assert.equal(memory.events.at(-1), 'delete:old-key');
    assert.equal(memory.files.get('old-key')?.deleted ?? true, true);
  });

  test('remover o logotipo volta ao padrão e apaga o arquivo', async () => {
    const memory = createMemoryLogoStore();
    setBrandingLogoStoreForTests(memory);
    memory.files.set('logo-key', { url: 'https://blob.test/logo.png', deleted: false });
    const church = churchDoc(churchA, {
      branding: { logoUrl: 'https://blob.test/logo.png', logoStorageKey: 'logo-key', primaryColor: '#2563EB' },
    });
    stubMethod(Church, 'findById', async () => church);

    const { res, state } = mockRes();
    await deleteChurchLogo(authReq(), res);
    assert.equal(state.statusCode, 200);
    assert.equal(state.body?.logoUrl, undefined);
    assert.equal(state.body?.primaryColor, '#2563EB');
    assert.equal(memory.files.get('logo-key')?.deleted, true);
  });

  test('se o banco falhar após o envio, o arquivo novo é apagado', async () => {
    const memory = createMemoryLogoStore();
    setBrandingLogoStoreForTests(memory);
    memory.files.set('old-key', { url: 'https://blob.test/old.png', deleted: false });
    const church = churchDoc(churchA, {
      branding: {
        logoUrl: 'https://blob.test/old.png',
        logoStorageKey: 'old-key',
      },
      async save() {
        throw new Error('falha ao gravar');
      },
    });
    stubMethod(Church, 'findById', async () => church);

    const { res, state } = mockRes();
    await postChurchLogo(
      authReq({
        file: { buffer: PNG, mimetype: 'image/png', originalname: 'novo.png', size: PNG.length },
      } as never),
      res
    );

    assert.equal(state.statusCode, 500);
    assert.equal(memory.files.get('old-key')?.deleted, false);
    const uploaded = [...memory.files.keys()].find((key) => key.startsWith(`church-branding/${churchA}/`));
    assert.ok(uploaded);
    assert.equal(memory.files.get(uploaded)?.deleted, true);
  });

  test('trocar o logotipo apaga o anterior e órfãos da mesma igreja', async () => {
    const memory = createMemoryLogoStore();
    setBrandingLogoStoreForTests(memory);
    const orphan = `church-branding/${churchA}/orfa.png`;
    const otherChurch = `church-branding/${churchB}/logo.png`;
    memory.files.set('old-key', { url: 'https://blob.test/old.png', deleted: false });
    memory.files.set(orphan, { url: `https://blob.test/${orphan}`, deleted: false });
    memory.files.set(otherChurch, { url: `https://blob.test/${otherChurch}`, deleted: false });
    const church = churchDoc(churchA, {
      branding: {
        logoUrl: 'https://blob.test/old.png',
        logoStorageKey: 'old-key',
      },
    });
    stubMethod(Church, 'findById', async () => church);

    const { res, state } = mockRes();
    await postChurchLogo(
      authReq({
        file: { buffer: PNG, mimetype: 'image/png', originalname: 'novo.png', size: PNG.length },
      } as never),
      res
    );

    assert.equal(state.statusCode, 200);
    assert.equal(memory.files.get('old-key')?.deleted, true);
    assert.equal(memory.files.get(orphan)?.deleted, true);
    assert.equal(memory.files.get(otherChurch)?.deleted, false);
    const kept = String(church.branding?.logoStorageKey);
    assert.equal(memory.files.get(kept)?.deleted, false);
  });

  test('restaurar padrão limpa cores e logotipo', async () => {
    const memory = createMemoryLogoStore();
    setBrandingLogoStoreForTests(memory);
    const church = churchDoc(churchA, {
      branding: {
        logoUrl: 'https://blob.test/logo.png',
        logoStorageKey: 'reset-key',
        primaryColor: '#112233',
        accentColor: '#445566',
      },
    });
    stubMethod(Church, 'findById', async () => church);

    const { res, state } = mockRes();
    await patchChurchBranding(authReq({ body: { restoreDefault: true } }), res);
    assert.equal(state.statusCode, 200);
    assert.deepEqual(state.body, { name: 'Igreja Alfa', updatedAt: undefined });
    assert.equal(church.branding, undefined);
    assert.ok(memory.events.includes('delete:reset-key'));
  });
});
