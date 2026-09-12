import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { confirmStateFromCode, resetStateFromStatus } from './authScreenState.ts';
import { readTokenFromHash, stripHashFromLocation } from './emailTokenFragment.ts';
import { maskEmail, resendSecondsLeft } from './pendingChallenge.ts';

const root = dirname(fileURLToPath(import.meta.url));
const clientSrc = join(root, '..');

test('token do fragmento é lido e removido do endereço', () => {
  assert.equal(readTokenFromHash('#token=abc123'), 'abc123');
  let nextUrl = '/confirmar-email#token=abc123';
  const history = {
    replaceState(_state: unknown, _title: string, url: string) {
      nextUrl = url;
    },
  };
  const token = stripHashFromLocation(history, {
    pathname: '/confirmar-email',
    search: '',
    hash: '#token=abc123',
  });
  assert.equal(token, 'abc123');
  assert.equal(nextUrl, '/confirmar-email');
});

test('contagem de reenvio e máscara de e-mail', () => {
  assert.equal(resendSecondsLeft(new Date(Date.now() + 15_000).toISOString(), Date.now()), 15);
  assert.equal(resendSecondsLeft(new Date(Date.now() - 1000).toISOString(), Date.now()), 0);
  assert.equal(maskEmail('ana@igreja.test').includes('ana@igreja.test'), false);
});

test('todas as situações de link têm estado visual', () => {
  assert.equal(confirmStateFromCode('expired'), 'expired');
  assert.equal(confirmStateFromCode('used'), 'used');
  assert.equal(confirmStateFromCode('unavailable'), 'temporary');
  assert.equal(confirmStateFromCode('invalid'), 'invalid');
  assert.equal(resetStateFromStatus('valid'), 'form');
  assert.equal(resetStateFromStatus('expired'), 'expired');
  assert.equal(resetStateFromStatus('used'), 'used');
  assert.equal(resetStateFromStatus('invalid'), 'invalid');

  const confirmPage = readFileSync(join(clientSrc, 'pages/ConfirmEmailPage.tsx'), 'utf8');
  for (const state of ['verifying', 'confirmed', 'invalid', 'expired', 'used', 'temporary', 'missing']) {
    assert.equal(confirmPage.includes(`${state}:`), true);
  }
  const resetPage = readFileSync(join(clientSrc, 'pages/ResetPasswordPage.tsx'), 'utf8');
  for (const state of ['validating', 'form', 'invalid', 'expired', 'used', 'saving', 'changed', 'missing']) {
    assert.equal(resetPage.includes(`${state}:`), true);
  }
});

test('cadastro mostra confirmação e não entra automaticamente', () => {
  const login = readFileSync(join(clientSrc, 'pages/LoginPage.tsx'), 'utf8');
  assert.match(login, /EmailConfirmationPanel/);
  assert.match(login, /savePendingChallengeId/);
  assert.equal(login.includes('navigate(from, { replace: true });\n        return;'), true);
  assert.match(login, /const result = await register/);
  assert.equal(/mode === 'login'[\s\S]*navigate\(from/.test(login), true);
  assert.match(login, /Código de seis dígitos|EmailConfirmationPanel/);
  assert.match(login, /Esqueceu sua senha\?/);
  const confirmPanel = readFileSync(join(clientSrc, 'components/EmailConfirmationPanel.tsx'), 'utf8');
  const forgotPage = readFileSync(join(clientSrc, 'pages/ForgotPasswordPage.tsx'), 'utf8');
  assert.match(confirmPanel, /EmailSpamNote/);
  assert.match(confirmPanel, /Código de seis dígitos/);
  assert.match(forgotPage, /EmailSpamNote/);
  assert.match(
    readFileSync(join(clientSrc, 'components/EmailSpamNote.tsx'), 'utf8'),
    /spam ou o lixo eletrônico/
  );
  assert.match(login, /mode === 'login' && \(/);
});

test('não existe chamada do Resend no navegador e o menu permanece nas rotas autenticadas', () => {
  const client = readFileSync(join(clientSrc, 'api/client.ts'), 'utf8');
  assert.equal(client.includes("from 'resend'"), false);
  assert.equal(client.includes('new Resend'), false);
  assert.equal(client.includes('RESEND_API_KEY'), false);
  assert.equal(client.includes('VITE_RESEND'), false);
  assert.match(client, /PendingRegistrationResponse/);
  assert.match(client, /confirmEmail/);
  assert.match(client, /forgotPassword/);

  const app = readFileSync(join(clientSrc, 'App.tsx'), 'utf8');
  const loginIndex = app.indexOf('path="/login"');
  const confirmIndex = app.indexOf('path="/confirmar-email"');
  const forgotIndex = app.indexOf('path="/esqueci-senha"');
  const resetIndex = app.indexOf('path="/redefinir-senha"');
  const protectedIndex = app.indexOf('element={<ProtectedRoute');
  assert.ok(loginIndex > 0 && confirmIndex > 0 && forgotIndex > 0 && resetIndex > 0);
  assert.ok(confirmIndex < protectedIndex);
  assert.ok(forgotIndex < protectedIndex);
  assert.ok(resetIndex < protectedIndex);
});
