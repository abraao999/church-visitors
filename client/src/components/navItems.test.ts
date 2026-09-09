import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { permissionsForRole } from '../utils/permissions.ts';
import { navItemVisible } from '../utils/permissions.ts';
import {
  isNavItemActive,
  NAV_ITEMS,
  NAV_SECTION_LABELS,
  visibleNavSections,
} from './navItems.ts';

const root = dirname(fileURLToPath(import.meta.url));

const EXPECTED_ITEMS = [
  { to: '/', label: 'Início', section: 'home', icon: 'home' },
  { to: '/visitantes', label: 'Visitantes', section: 'portaria', icon: 'users' },
  { to: '/acompanhamento', label: 'Acompanhamento', section: 'portaria', icon: 'heartHand' },
  { to: '/avisos-veiculos', label: 'Avisos de veículos', section: 'portaria', icon: 'car' },
  { to: '/cultos', label: 'Cultos', section: 'worship', icon: 'calendar' },
  { to: '/oracao', label: 'Pedidos de oração', section: 'worship', icon: 'prayer' },
  { to: '/paineis', label: 'Painéis', section: 'worship', icon: 'panels' },
  { to: '/acessos', label: 'Acessos sem login', section: 'admin', icon: 'link' },
  { to: '/igreja', label: 'Igreja', section: 'admin', icon: 'pin' },
  { to: '/configuracoes', label: 'Holyrics', section: 'admin', icon: 'music' },
] as const;

test('o menu tem a ordem, os nomes e as seções centralizados', () => {
  assert.deepEqual(
    NAV_ITEMS.map((item) => ({
      to: item.to,
      label: item.label,
      section: item.section,
      icon: item.icon,
    })),
    EXPECTED_ITEMS
  );
  assert.equal(NAV_ITEMS.find((item) => item.to === '/configuracoes')?.label, 'Holyrics');
  assert.equal(NAV_ITEMS.some((item) => item.label === 'Holyric'), false);
  assert.equal(NAV_ITEMS.some((item) => item.label === 'Culto em andamento'), false);
  assert.equal(NAV_ITEMS.some((item) => item.label === 'Recorrências'), false);
  assert.deepEqual(NAV_SECTION_LABELS, {
    portaria: 'PORTARIA',
    worship: 'CULTO E EXIBIÇÃO',
    admin: 'ADMINISTRAÇÃO',
  });
});

test('desktop e mobile usam a mesma lista filtrada e a mesma ordem', () => {
  const visible = NAV_ITEMS.filter((item) =>
    navItemVisible(item.to, 'owner', permissionsForRole('owner'), { visitorFollowUpEnabled: true })
  );
  const sections = visibleNavSections(visible);
  assert.deepEqual(
    sections.map((section) => ({
      id: section.id,
      label: section.label,
      items: section.items.map((item) => item.to),
    })),
    [
      { id: 'home', label: null, items: ['/'] },
      { id: 'portaria', label: 'PORTARIA', items: ['/visitantes', '/acompanhamento', '/avisos-veiculos'] },
      { id: 'worship', label: 'CULTO E EXIBIÇÃO', items: ['/cultos', '/oracao', '/paineis'] },
      { id: 'admin', label: 'ADMINISTRAÇÃO', items: ['/acessos', '/igreja', '/configuracoes'] },
    ]
  );
});

test('seção vazia não é exibida', () => {
  const visible = NAV_ITEMS.filter((item) => ['/', '/oracao'].includes(item.to));
  const sections = visibleNavSections(visible);
  assert.deepEqual(
    sections.map((section) => section.id),
    ['home', 'worship']
  );
  assert.equal(sections.some((section) => section.id === 'portaria'), false);
  assert.equal(sections.some((section) => section.id === 'admin'), false);
});

test('rota filha destaca somente o item principal correto', () => {
  assert.equal(isNavItemActive('/cultos/abc', '/cultos'), true);
  assert.equal(isNavItemActive('/cultos/serie/xyz', '/cultos'), true);
  assert.equal(isNavItemActive('/igreja/equipe', '/igreja'), true);
  assert.equal(isNavItemActive('/igreja/identidade', '/igreja'), true);
  assert.equal(isNavItemActive('/acompanhamento', '/acompanhamento'), true);
  assert.equal(isNavItemActive('/acompanhamento', '/visitantes'), false);
  assert.equal(isNavItemActive('/cultos/abc', '/'), false);
  assert.equal(isNavItemActive('/igreja/equipe', '/'), false);

  const highlighted = NAV_ITEMS.filter((item) => isNavItemActive('/igreja/equipe', item.to));
  assert.deepEqual(highlighted.map((item) => item.to), ['/igreja']);
});

test('avisos de veículos mantêm o indicador de badge', () => {
  assert.equal(NAV_ITEMS.find((item) => item.to === '/avisos-veiculos')?.badge, 'vehicleNotices');
  assert.equal(
    NAV_ITEMS.filter((item) => item.badge === 'vehicleNotices').map((item) => item.to).length,
    1
  );
});

test('o drawer fecha depois da navegação e usa a mesma configuração do desktop', () => {
  const layout = readFileSync(join(root, 'Layout.tsx'), 'utf8');
  const drawer = readFileSync(join(root, 'MobileNavDrawer.tsx'), 'utf8');
  assert.match(layout, /visibleNavSections\(navItems\)/);
  assert.match(layout, /sections=\{sections\}/);
  assert.match(layout, /setDrawerOpen\(false\)/);
  assert.match(drawer, /onClick=\{onClose\}/);
  assert.match(drawer, /Escape/);
  assert.equal(layout.includes('DRAWER_PRIMARY'), false);
  assert.equal(drawer.includes('drawerLabel'), false);
});
