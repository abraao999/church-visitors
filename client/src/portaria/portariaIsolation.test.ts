import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('a barra lateral administrativa não ganhou item da portaria', () => {
  const source = readFileSync(join(root, 'components/navItems.ts'), 'utf8');
  assert.equal(source.includes('/portaria'), false);
  assert.equal(source.includes('Dispositivos da portaria'), false);
});

test('Layout não importa o aplicativo da portaria', () => {
  const source = readFileSync(join(root, 'components/Layout.tsx'), 'utf8');
  assert.equal(source.includes('PortariaApp'), false);
  assert.equal(source.includes('portaria/'), false);
});

test('administração dos aparelhos fica na tela de Acessos', () => {
  const source = readFileSync(join(root, 'pages/GuestAccessesPage.tsx'), 'utf8');
  assert.equal(source.includes('PortariaDevicesSection'), true);
});
