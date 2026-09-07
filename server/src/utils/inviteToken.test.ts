import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Types } from 'mongoose';
import {
  createInvitePublicId,
  createInviteToken,
  parseInviteToken,
  verifyInviteToken,
} from './inviteToken.js';

process.env.GUEST_ACCESS_SECRET = 'teste-guest-convite-equipe-chave-longa-654321';
process.env.JWT_SECRET = 'teste-jwt-convite-equipe-chave-longa-123456789';

describe('token de convite da equipe', () => {
  test('é opaco, assinável e muda com a versão', () => {
    const churchId = new Types.ObjectId().toHexString();
    const publicId = createInvitePublicId();
    const token = createInviteToken(publicId, 1, churchId);
    const parsed = parseInviteToken(token);
    assert.ok(parsed);
    assert.equal(parsed.publicId, publicId);
    assert.equal(verifyInviteToken(parsed, 1, churchId), true);
    assert.equal(verifyInviteToken(parsed, 2, churchId), false);
    assert.equal(token.includes(churchId), false);
    assert.equal(JSON.stringify(parsed).includes(churchId), false);
  });

  test('igreja diferente não valida a assinatura', () => {
    const publicId = createInvitePublicId();
    const churchA = new Types.ObjectId().toHexString();
    const churchB = new Types.ObjectId().toHexString();
    const parsed = parseInviteToken(createInviteToken(publicId, 1, churchA));
    assert.ok(parsed);
    assert.equal(verifyInviteToken(parsed, 1, churchB), false);
  });
});
