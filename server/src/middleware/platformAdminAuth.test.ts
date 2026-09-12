import assert from 'node:assert/strict';
import test from 'node:test';
import { getPlatformAdminJwtSecret } from './platformAdminAuth.js';

test('PLATFORM_ADMIN_JWT_SECRET recusa valor curto, exemplo e reutilização', () => {
  const base = {
    PLATFORM_ADMIN_JWT_SECRET: 'teste-platform-admin-secret-chave-longa-xyz',
    JWT_SECRET: 'teste-jwt-enumeracao-conta-chave-longa-123456',
    GUEST_ACCESS_SECRET: 'teste-guest-enumeracao-conta-chave-longa-654321',
    EMAIL_TOKEN_SECRET: 'teste-email-token-secret-chave-longa-abcdef',
  } as NodeJS.ProcessEnv;

  assert.throws(() => getPlatformAdminJwtSecret({ ...base, PLATFORM_ADMIN_JWT_SECRET: undefined }), /32 caracteres/);
  assert.throws(
    () => getPlatformAdminJwtSecret({ ...base, PLATFORM_ADMIN_JWT_SECRET: 'troque-por-uma-chave-longa-e-aleatoria-admin-32+' }),
    /valor de exemplo/
  );
  assert.throws(() => getPlatformAdminJwtSecret({ ...base, JWT_SECRET: base.PLATFORM_ADMIN_JWT_SECRET }), /JWT_SECRET/);
  assert.throws(
    () => getPlatformAdminJwtSecret({ ...base, GUEST_ACCESS_SECRET: base.PLATFORM_ADMIN_JWT_SECRET }),
    /GUEST_ACCESS_SECRET/
  );
  assert.throws(
    () => getPlatformAdminJwtSecret({ ...base, EMAIL_TOKEN_SECRET: base.PLATFORM_ADMIN_JWT_SECRET }),
    /EMAIL_TOKEN_SECRET/
  );
  assert.equal(getPlatformAdminJwtSecret(base), 'teste-platform-admin-secret-chave-longa-xyz');
});
