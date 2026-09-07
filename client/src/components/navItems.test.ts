import assert from 'node:assert/strict';
import test from 'node:test';
import { MOBILE_NAV_ITEMS, NAV_ITEMS } from './navItems.ts';

test('a barra de navegação permanece com os mesmos itens, textos e ordem', () => {
  assert.deepEqual(
    NAV_ITEMS.map((item) => ({ to: item.to, label: item.label, short: item.short, icon: item.icon })),
    [
      { to: '/', label: 'Início', short: 'Início', icon: 'home' },
      { to: '/visitantes', label: 'Visitantes', short: 'Visit.', icon: 'users' },
      { to: '/oracao', label: 'Oração', short: 'Oração', icon: 'prayer' },
      { to: '/acessos', label: 'Acessos', short: 'Acessos', icon: 'link' },
      { to: '/cultos', label: 'Cultos', short: 'Cultos', icon: 'calendar' },
      { to: '/avisos-veiculos', label: 'Avisos de veículos', short: 'Avisos', icon: 'car' },
      { to: '/paineis', label: 'Painéis', short: 'Painéis', icon: 'panels' },
      { to: '/igreja', label: 'Igreja', short: 'Igreja', icon: 'pin' },
      { to: '/configuracoes', label: 'Holyric', short: 'Holyric', icon: 'music' },
    ]
  );
  assert.equal(NAV_ITEMS.some((item) => item.label === 'Culto em andamento'), false);
  assert.equal(NAV_ITEMS.some((item) => item.label === 'Recorrências'), false);
  assert.deepEqual(
    MOBILE_NAV_ITEMS.map((item) => item.to),
    NAV_ITEMS.filter((item) => item.to !== '/acessos').map((item) => item.to)
  );
});
