import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('painéis de TV e páginas públicas não carregam o provider de alertas', () => {
  const files = [
    'pages/panels/VehicleNoticesPanelPage.tsx',
    'pages/PublicAccessPage.tsx',
    'pages/panels/HymnsPanelPage.tsx',
    'pages/panels/WorshipPanelPage.tsx',
  ];
  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    assert.equal(source.includes('VehicleAlertProvider'), false, file);
  }
});

test('logout do contexto de autenticação zera o usuário autenticado', () => {
  const source = readFileSync(join(root, 'auth/AuthContext.tsx'), 'utf8');
  assert.match(source, /setUser\(null\)/);
});
