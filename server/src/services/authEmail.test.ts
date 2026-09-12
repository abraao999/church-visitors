import assert from 'node:assert/strict';
import test from 'node:test';
import {
  renderOwnerVerificationEmail,
  renderOwnerWelcomeEmail,
  renderPasswordResetEmail,
} from './authEmail.js';

test('e-mails escapam nome e igreja e não pedem rastreamento no HTML', () => {
  const verify = renderOwnerVerificationEmail({
    name: '<script>alert(1)</script>',
    churchName: 'Igreja "Nova"',
    confirmUrl: 'https://app.eclesiafy.com.br/confirmar-email#token=abc',
    code: '123456',
    ttlMinutes: '30',
  });
  assert.equal(verify.subject, 'Seu código Eclesiafy: 123456');
  assert.equal(verify.html.includes('<script>alert(1)</script>'), false);
  assert.equal(verify.html.includes('&lt;script&gt;'), true);
  assert.equal(verify.html.includes('Igreja &quot;Nova&quot;'), true);
  assert.equal(verify.html.includes('Confirmar meu e-mail'), true);
  assert.equal(verify.html.includes('https://app.eclesiafy.com.br/confirmar-email#token=abc'), true);
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

  const welcome = renderOwnerWelcomeEmail({
    name: '<b>Ana</b>',
    churchName: 'Igreja "Nova"',
    appUrl: 'https://app.eclesiafy.com.br',
  });
  assert.equal(welcome.subject, 'Cadastro da Igreja "Nova" concluído');
  assert.equal(welcome.html.includes('<b>Ana</b>'), false);
  assert.equal(welcome.html.includes('&lt;b&gt;Ana&lt;/b&gt;'), true);
  assert.equal(welcome.html.includes('Igreja &quot;Nova&quot;'), true);
  assert.equal(welcome.text.includes('concluído com sucesso'), true);
  assert.equal(welcome.text.includes('token'), false);
  assert.equal(welcome.html.includes('password'), false);
});
