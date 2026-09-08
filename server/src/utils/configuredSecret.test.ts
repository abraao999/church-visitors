import assert from 'node:assert/strict';
import test from 'node:test';
import { isPlaceholderSecret, requireConfiguredSecret } from './configuredSecret.js';

test('recusa o valor de exemplo do .env.example', () => {
  assert.equal(isPlaceholderSecret('troque-por-uma-chave-longa-e-aleatoria-jwt-32+'), true);
  assert.equal(isPlaceholderSecret('teste-jwt-isolamento-tenant-chave-longa-123456'), false);
  assert.throws(
    () => requireConfiguredSecret('JWT_SECRET', 'troque-por-uma-chave-longa-e-aleatoria-jwt-32+'),
    /valor de exemplo/
  );
  assert.throws(() => requireConfiguredSecret('CRON_SECRET', 'curto'), /32 caracteres/);
  assert.equal(
    requireConfiguredSecret('GUEST_ACCESS_SECRET', 'teste-guest-isolamento-tenant-chave-longa-654321'),
    'teste-guest-isolamento-tenant-chave-longa-654321'
  );
});
