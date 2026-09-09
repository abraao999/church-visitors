import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { maskPhoneInput, shouldShowFollowUpBlock } from './visitorFollowUp.ts';

const root = dirname(fileURLToPath(import.meta.url));

test('o bloco de acompanhamento só aparece com a função ativa e permissão', () => {
  assert.equal(shouldShowFollowUpBlock(false, true), false);
  assert.equal(shouldShowFollowUpBlock(true, false), false);
  assert.equal(shouldShowFollowUpBlock(true, true), true);
});

test('o telefone usa máscara numérica sem letras', () => {
  assert.equal(maskPhoneInput('44999990000'), '(44) 99999-0000');
  assert.equal(maskPhoneInput('abc44def'), '44');
});

test('cadastro e acompanhamento não permitem rolagem horizontal', () => {
  const visitorCss = readFileSync(join(root, '../components/VisitorForm.css'), 'utf8');
  const followUpCss = readFileSync(join(root, '../pages/FollowUpPage.css'), 'utf8');
  const indexCss = readFileSync(join(root, '../index.css'), 'utf8');
  assert.match(indexCss, /overflow-x:\s*hidden/);
  assert.match(visitorCss, /max-width:\s*100%/);
  assert.match(followUpCss, /overflow-x:\s*hidden/);
});
