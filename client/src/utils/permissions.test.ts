import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { NAV_ITEMS } from '../components/navItems.ts';
import {
  navItemVisible,
  PERMISSIONS,
  PERMISSION_GROUPS,
  permissionsForRole,
  type TeamRole,
} from './permissions.ts';

describe('menu lateral por permissão', () => {
  test('a ordem e os textos do menu permanecem os mesmos e Equipe não entra', () => {
    assert.deepEqual(
      NAV_ITEMS.map((item) => item.label),
      [
        'Início',
        'Visitantes',
        'Oração',
        'Acessos',
        'Cultos',
        'Avisos de veículos',
        'Painéis',
        'Igreja',
        'Holyric',
      ]
    );
    assert.deepEqual(
      NAV_ITEMS.map((item) => item.to),
      [
        '/',
        '/visitantes',
        '/oracao',
        '/acessos',
        '/cultos',
        '/avisos-veiculos',
        '/paineis',
        '/igreja',
        '/configuracoes',
      ]
    );
    assert.equal(
      NAV_ITEMS.some((item) => item.label === 'Equipe' || item.to.includes('equipe')),
      false
    );
    assert.equal(
      NAV_ITEMS.some((item) => item.to.includes('identidade') || item.label === 'Identidade visual'),
      false
    );
  });

  test('o proprietário vê todos os itens atuais', () => {
    for (const item of NAV_ITEMS) {
      assert.equal(navItemVisible(item.to, 'owner', permissionsForRole('owner')), true);
    }
  });

  test('cada função vê somente as áreas autorizadas', () => {
    const visible = (role: TeamRole) =>
      NAV_ITEMS.filter((item) => navItemVisible(item.to, role, permissionsForRole(role))).map(
        (item) => item.to
      );

    assert.deepEqual(visible('portaria'), ['/', '/visitantes', '/cultos', '/avisos-veiculos']);
    assert.deepEqual(visible('intercession'), ['/', '/oracao']);
    assert.deepEqual(visible('louvor'), ['/', '/cultos', '/paineis', '/configuracoes']);
    assert.deepEqual(visible('midia'), ['/', '/acessos', '/paineis']);
    assert.ok(visible('admin').includes('/igreja'));
    assert.ok(visible('admin').includes('/configuracoes'));
  });
});

describe('catálogo de permissões da equipe', () => {
  test('a tela de equipe lista todas as chaves usadas no sistema', () => {
    const listed = PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key));
    for (const key of PERMISSIONS) {
      assert.equal(listed.includes(key), true, `faltou ${key} na tela de equipe`);
    }
  });
});
