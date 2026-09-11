import assert from 'node:assert/strict';
import test from 'node:test';
import { getEmailTokenSecret, getPublicAppOrigin } from './emailConfig.js';

test('EMAIL_TOKEN_SECRET recusa valor curto, exemplo e reutilização', () => {
  const base = {
    EMAIL_TOKEN_SECRET: 'teste-email-token-secret-chave-longa-abcdef',
    JWT_SECRET: 'teste-jwt-enumeracao-conta-chave-longa-123456',
    GUEST_ACCESS_SECRET: 'teste-guest-enumeracao-conta-chave-longa-654321',
    CRON_SECRET: 'teste-cron-secret-chave-longa-diferente-999',
  } as NodeJS.ProcessEnv;

  assert.throws(() => getEmailTokenSecret({ ...base, EMAIL_TOKEN_SECRET: undefined }), /32 caracteres/);
  assert.throws(
    () => getEmailTokenSecret({ ...base, EMAIL_TOKEN_SECRET: 'troque-por-uma-chave-longa-e-aleatoria-email-32+' }),
    /valor de exemplo/
  );
  assert.throws(
    () => getEmailTokenSecret({ ...base, JWT_SECRET: base.EMAIL_TOKEN_SECRET }),
    /JWT_SECRET/
  );
  assert.throws(
    () => getEmailTokenSecret({ ...base, GUEST_ACCESS_SECRET: base.EMAIL_TOKEN_SECRET }),
    /GUEST_ACCESS_SECRET/
  );
  assert.throws(
    () => getEmailTokenSecret({ ...base, CRON_SECRET: base.EMAIL_TOKEN_SECRET }),
    /CRON_SECRET/
  );
  assert.equal(getEmailTokenSecret(base), 'teste-email-token-secret-chave-longa-abcdef');
});

test('APP_ORIGIN de produção recusa localhost e domínio temporário da Vercel', () => {
  const prod = { NODE_ENV: 'production', VERCEL: '1' } as NodeJS.ProcessEnv;
  assert.throws(() => getPublicAppOrigin(prod), /APP_ORIGIN/);
  assert.throws(
    () => getPublicAppOrigin({ ...prod, APP_ORIGIN: 'http://localhost:5173' }),
    /HTTPS|localhost/
  );
  assert.throws(
    () => getPublicAppOrigin({ ...prod, APP_ORIGIN: 'https://app.vercel.app' }),
    /temporário/
  );
  assert.equal(
    getPublicAppOrigin({ ...prod, APP_ORIGIN: 'https://app.eclesiafy.com.br' }),
    'https://app.eclesiafy.com.br'
  );
});
