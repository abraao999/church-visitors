import assert from 'node:assert/strict';
import test from 'node:test';
import { Types } from 'mongoose';
import {
  createGuestPublicId,
  createGuestToken,
  opaqueRateLimitKey,
  parseGuestToken,
  verifyGuestTokenSignature,
} from '../utils/guestToken.js';
import { GuestAccess } from './GuestAccess.js';

process.env.GUEST_ACCESS_SECRET = 'teste-acesso-convidado-chave-separada-123456789';

test('publicId possui entropia e formato seguros para URL', () => {
  const first = createGuestPublicId();
  const second = createGuestPublicId();

  assert.match(first, /^[A-Za-z0-9_-]{32}$/);
  assert.match(second, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(first, second);
});

test('token válido é opaco, assinado e não contém o identificador da igreja', () => {
  const publicId = createGuestPublicId();
  const churchId = new Types.ObjectId().toHexString();
  const token = createGuestToken(publicId, 1);
  const parsed = parseGuestToken(token);

  assert.ok(parsed);
  assert.equal(parsed.publicId, publicId);
  assert.equal(token.includes(churchId), false);
  assert.equal(verifyGuestTokenSignature(parsed, 1), true);
});

test('adulteração do token é rejeitada', () => {
  const token = createGuestToken(createGuestPublicId(), 1);
  const parsed = parseGuestToken(token);
  assert.ok(parsed);

  const replacement = parsed.signature.endsWith('A') ? 'B' : 'A';
  const changed = parseGuestToken(
    `${parsed.publicId}.${parsed.signature.slice(0, -1)}${replacement}`
  );

  assert.ok(changed);
  assert.equal(verifyGuestTokenSignature(changed, 1), false);
});

test('incrementar a versão invalida imediatamente o token anterior', () => {
  const publicId = createGuestPublicId();
  const oldToken = parseGuestToken(createGuestToken(publicId, 1));
  const renewedToken = parseGuestToken(createGuestToken(publicId, 2));

  assert.ok(oldToken);
  assert.ok(renewedToken);
  assert.equal(verifyGuestTokenSignature(oldToken, 2), false);
  assert.equal(verifyGuestTokenSignature(renewedToken, 2), true);
});

test('chaves do rate limit não armazenam a identidade original', () => {
  const identity = '203.0.113.10';
  const key = opaqueRateLimitKey('ip', identity, 12345);

  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key.includes(identity), false);
});

test('modelo restringe cada acesso a uma única permissão', () => {
  const base = {
    churchId: new Types.ObjectId(),
    createdBy: {
      userId: new Types.ObjectId(),
      churchId: new Types.ObjectId(),
      name: 'Responsável',
    },
    name: 'Portaria — domingo',
    publicId: createGuestPublicId(),
  };

  assert.equal(new GuestAccess({ ...base, type: 'visitors:create' }).validateSync(), undefined);
  assert.equal(new GuestAccess({ ...base, type: 'prayers:create' }).validateSync(), undefined);
  assert.ok(new GuestAccess({ ...base, type: 'records:read' }).validateSync());
});
