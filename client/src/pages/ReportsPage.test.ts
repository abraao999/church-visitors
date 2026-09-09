import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

test('a página de relatórios não cria rolagem horizontal da página', () => {
  const css = readFileSync(join(root, 'ReportsPage.css'), 'utf8');
  const page = readFileSync(join(root, 'ReportsPage.tsx'), 'utf8');
  assert.match(css, /\.reports-page\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(page, /ANÁLISES DA IGREJA/);
  assert.match(page, /Exportar relatório/);
  assert.match(page, /role="tablist"/);
});
