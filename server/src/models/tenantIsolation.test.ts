import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { getJwtSecret, signToken, toActor, type AuthContext } from '../middleware/auth.js';
import { tenantRecordFilter, withChurch } from '../utils/tenant.js';
import { PrayerRequest } from './PrayerRequest.js';

process.env.JWT_SECRET = 'teste-jwt-isolamento-tenant-chave-longa-123456';
process.env.GUEST_ACCESS_SECRET = 'teste-guest-isolamento-tenant-chave-longa-654321';

const session: AuthContext = {
  userId: new Types.ObjectId().toHexString(),
  churchId: new Types.ObjectId().toHexString(),
  role: 'owner',
  name: 'Responsável',
  email: 'responsavel@example.com',
  permissions: [],
};

test('filtro do tenant sempre prevalece sobre valores externos', () => {
  const otherChurchId = new Types.ObjectId();
  const filter = withChurch(session.churchId, {
    churchId: otherChurchId,
    status: 'active',
  });

  assert.equal(filter.churchId.toHexString(), session.churchId);
  assert.equal(filter.status, 'active');
});

test('filtro por registro exige id válido e mantém o escopo da igreja', () => {
  assert.equal(tenantRecordFilter(session.churchId, 'id-invalido'), null);

  const recordId = new Types.ObjectId().toHexString();
  const filter = tenantRecordFilter(session.churchId, recordId);

  assert.ok(filter);
  assert.equal((filter._id as Types.ObjectId).toHexString(), recordId);
  assert.equal(filter.churchId.toHexString(), session.churchId);
});

test('sessão assinada e ator carregam igreja e papel validados', () => {
  const token = signToken(session);
  const payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as Record<
    string,
    unknown
  >;
  const actor = toActor(session);

  assert.equal(payload.sub, session.userId);
  assert.equal(payload.churchId, session.churchId);
  assert.equal(payload.role, 'owner');
  assert.equal(payload.tv, 0);
  assert.equal(actor.userId.toHexString(), session.userId);
  assert.equal(actor.churchId.toHexString(), session.churchId);
});

test('assinatura da sessão nunca usa segredo padrão', () => {
  const original = process.env.JWT_SECRET;
  try {
    delete process.env.JWT_SECRET;
    assert.throws(() => signToken(session), /JWT_SECRET/);

    process.env.JWT_SECRET = 'curto';
    assert.throws(() => signToken(session), /32 caracteres/);

    process.env.JWT_SECRET = process.env.GUEST_ACCESS_SECRET;
    assert.throws(() => signToken(session), /diferente de GUEST_ACCESS_SECRET/);
  } finally {
    process.env.JWT_SECRET = original;
  }
});

test('pedido privado aceita as origens novas sem remover compatibilidade legada', () => {
  const sourcePath = PrayerRequest.schema.path('source') as unknown as {
    enumValues: string[];
  };

  assert.deepEqual(sourcePath.enumValues, ['owner', 'guest_access', 'porteiro', 'live']);
});
