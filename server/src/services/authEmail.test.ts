import assert from 'node:assert/strict';
import test from 'node:test';
import { renderOwnerVerificationEmail, renderPasswordResetEmail } from './authEmail.js';

test('e-mails escapam nome e igreja e não pedem rastreamento no HTML', () => {
  const verify = renderOwnerVerificationEmail({
    name: '<script>alert(1)</script>',
    churchName: 'Igreja "Nova"',
    confirmUrl: 'https://app.eclesiafy.com.br/confirmar-email#token=abc',
    code: '123456',
    ttlMinutes: '30',
  });
  assert.equal(verify.subject, 'Confirme seu e-mail — Eclesiafy');
  assert.equal(verify.html.includes('<script>alert(1)</script>'), false);
  assert.equal(verify.html.includes('&lt;script&gt;'), true);
  assert.equal(verify.html.includes('Igreja &quot;Nova&quot;'), true);
  assert.equal(verify.html.includes('Confirmar meu e-mail'), true);
  assert.equal(verify.text.includes('123456'), true);
  assert.equal(verify.html.includes('open-tracking'), false);

  const reset = renderPasswordResetEmail({
    name: 'Ana',
    churchName: 'Igreja da Paz',
    resetUrl: 'https://app.eclesiafy.com.br/redefinir-senha#token=abc',
    ttlMinutes: '30',
  });
  assert.equal(reset.subject, 'Redefinição de senha — Eclesiafy');
  assert.equal(reset.html.includes('Criar uma nova senha'), true);
  assert.equal(reset.text.includes('passwordHash'), false);
  assert.equal(reset.html.includes('userId'), false);
});
