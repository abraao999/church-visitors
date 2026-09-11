import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createHighEntropyToken,
  createVerificationCode,
  hashPasswordResetToken,
  hashVerificationCode,
  hashVerificationToken,
  maskEmail,
  secretsMatch,
} from './emailCrypto.js';

process.env.EMAIL_TOKEN_SECRET = 'teste-email-token-secret-chave-longa-abcdef';
process.env.JWT_SECRET = 'teste-jwt-enumeracao-conta-chave-longa-123456';
process.env.GUEST_ACCESS_SECRET = 'teste-guest-enumeracao-conta-chave-longa-654321';
process.env.CRON_SECRET = 'teste-cron-secret-chave-longa-diferente-999';

test('token e código não são armazenados em texto puro', () => {
  const token = createHighEntropyToken();
  const code = createVerificationCode();
  const tokenHash = hashVerificationToken(token);
  const codeHash = hashVerificationCode('challenge', code);
  const resetHash = hashPasswordResetToken(token);

  assert.equal(token.includes(tokenHash), false);
  assert.equal(tokenHash.includes(token), false);
  assert.equal(codeHash.includes(code), false);
  assert.equal(resetHash.includes(token), false);
  assert.match(code, /^\d{6}$/);
  assert.equal(secretsMatch(tokenHash, hashVerificationToken(token)), true);
  assert.equal(secretsMatch(tokenHash, hashVerificationToken(`${token}x`)), false);
});

test('máscara de e-mail esconde o endereço completo', () => {
  const masked = maskEmail('ana.silva@igreja.test');
  assert.equal(masked.includes('ana.silva'), false);
  assert.match(masked, /^a\*\*\*@/);
});
