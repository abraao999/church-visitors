import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { NAV_ITEMS } from '../components/navItems.ts';
import {
  LEGACY_PANEL_PATHS,
  PANEL_OPTIONS,
  panelPath,
  unifiedAuthPanelPath,
  unifiedPanelPath,
} from './publicAccess.ts';
import {
  nextPollDelay,
  sharedWorshipPageCount,
  sliceRecycledPage,
  TV_VIEWPORTS,
  worshipEmptyState,
  worshipPayloadHasPrivateKey,
  WORSHIP_PAGE_SIZE,
} from './worshipPanel.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('a paginação compartilhada usa no máximo três itens e recicla a coluna menor', () => {
  const visitors = ['a', 'b', 'c', 'd', 'e'];
  const prayers = ['p1'];
  assert.equal(sharedWorshipPageCount(visitors.length, prayers.length), 2);
  assert.deepEqual(sliceRecycledPage(visitors, 0), ['a', 'b', 'c']);
  assert.deepEqual(sliceRecycledPage(visitors, 1), ['d', 'e']);
  assert.deepEqual(sliceRecycledPage(prayers, 0), ['p1']);
  assert.deepEqual(sliceRecycledPage(prayers, 1), ['p1']);
  assert.equal(sliceRecycledPage(visitors, 0).length <= WORSHIP_PAGE_SIZE, true);
});

test('os estados vazios cobrem cada combinação sem reutilizar culto antigo', () => {
  assert.equal(worshipEmptyState({ hasActiveService: false, visitorCount: 0, prayerCount: 0 }), 'inactive');
  assert.equal(worshipEmptyState({ hasActiveService: true, visitorCount: 0, prayerCount: 0 }), 'waiting');
  assert.equal(worshipEmptyState({ hasActiveService: true, visitorCount: 0, prayerCount: 2 }), 'visitors-empty');
  assert.equal(worshipEmptyState({ hasActiveService: true, visitorCount: 3, prayerCount: 0 }), 'prayers-empty');
  assert.equal(worshipEmptyState({ hasActiveService: true, visitorCount: 1, prayerCount: 1 }), 'ready');
});

test('a espera progressiva não consulta a API de forma agressiva', () => {
  assert.equal(nextPollDelay(0), 15_000);
  assert.ok(nextPollDelay(1) > 15_000);
  assert.ok(nextPollDelay(4) <= 60_000);
});

test('a resposta do painel não deve carregar chaves privadas', () => {
  const leaks = worshipPayloadHasPrivateKey({
    church: { name: 'AD' },
    visitors: [{ id: '1', city: 'Umuarama', members: [{ id: '1', name: 'Ana' }] }],
  });
  assert.deepEqual(leaks, []);
  assert.ok(
    worshipPayloadHasPrivateKey({ churchId: 'abc', createdBy: { name: 'x' } }).includes('churchId')
  );
});

test('links e QR Codes passam a apontar ao painel unificado', () => {
  assert.equal(unifiedAuthPanelPath(), '/paineis/culto');
  assert.equal(unifiedPanelPath('token-seguro'), '/painel/token-seguro/culto');
  assert.equal(panelPath('token-seguro', 'culto'), '/painel/token-seguro/culto');
  assert.equal(PANEL_OPTIONS.some((item) => item.path === 'culto'), true);
  assert.equal(PANEL_OPTIONS.some((item) => item.path === 'visitantes'), false);
  assert.equal(PANEL_OPTIONS.some((item) => item.path === 'oracao'), false);
  assert.equal(LEGACY_PANEL_PATHS.has('visitantes'), true);
});

test('o menu lateral mantém exatamente os mesmos itens, textos e ordem', () => {
  assert.deepEqual(
    NAV_ITEMS.map((item) => ({ to: item.to, label: item.label, short: item.short, icon: item.icon })),
    [
      { to: '/', label: 'Início', short: 'Início', icon: 'home' },
      { to: '/visitantes', label: 'Visitantes', short: 'Visit.', icon: 'users' },
      { to: '/acompanhamento', label: 'Acompanhamento', short: 'Acomp.', icon: 'heartHand' },
      { to: '/avisos-veiculos', label: 'Avisos de veículos', short: 'Avisos', icon: 'car' },
      { to: '/cultos', label: 'Cultos', short: 'Cultos', icon: 'calendar' },
      { to: '/oracao', label: 'Pedidos de oração', short: 'Oração', icon: 'prayer' },
      { to: '/paineis', label: 'Painéis', short: 'Painéis', icon: 'panels' },
      { to: '/relatorios', label: 'Relatórios', short: 'Relat.', icon: 'chart' },
      { to: '/acessos', label: 'Acessos sem login', short: 'Acessos', icon: 'link' },
      { to: '/igreja', label: 'Igreja', short: 'Igreja', icon: 'pin' },
      { to: '/configuracoes', label: 'Holyrics', short: 'Holyrics', icon: 'music' },
    ]
  );
});

test('rotas antigas redirecionam e não restam duas implementações de painel', () => {
  const app = readFileSync(join(root, 'App.tsx'), 'utf8');
  const panels = readFileSync(join(root, 'pages/PanelsPage.tsx'), 'utf8');
  const layout = readFileSync(join(root, 'components/Layout.tsx'), 'utf8');
  const prayers = readFileSync(join(root, 'pages/PrayerRequestsPage.tsx'), 'utf8');
  assert.match(app, /\/paineis\/culto/);
  assert.match(app, /LegacyPanelRedirect/);
  assert.equal(app.includes('VisitorsPanelPage'), false);
  assert.equal(app.includes('PrayersPanelPage'), false);
  assert.match(panels, /Painel do culto/);
  assert.match(panels, /\/paineis\/culto/);
  assert.equal(panels.includes('/painel/visitantes'), false);
  assert.equal(panels.includes('/painel/oracao'), false);
  assert.match(layout, /\/paineis\/culto/);
  assert.match(prayers, /\/paineis\/culto/);
});

test('o CSS do painel cobre as resoluções de TV sem rolagem', () => {
  const css = readFileSync(join(root, 'pages/panels/WorshipPanelPage.css'), 'utf8');
  assert.match(css, /overflow:\s*hidden/);
  assert.match(css, /100vw/);
  assert.match(css, /100dvh/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /3840px/);
  assert.match(css, /grid-template-columns:\s*1fr 1fr/);
  assert.match(css, /\.worship-tv-card\.is-prayer h3[\s\S]*white-space:\s*normal/);
  assert.match(css, /\.worship-tv-card\.is-prayer h3[\s\S]*overflow-wrap:\s*anywhere/);
  assert.equal(TV_VIEWPORTS.length, 3);
  assert.deepEqual(
    TV_VIEWPORTS.map((item) => `${item.width}x${item.height}`),
    ['1280x720', '1920x1080', '3840x2160']
  );
});

test('o service worker continua sem cachear a API privada do painel', () => {
  const policy = readFileSync(join(root, 'pwa/cachePolicy.ts'), 'utf8');
  assert.match(policy, /\/api\//);
  assert.match(policy, /network-only/);
});
