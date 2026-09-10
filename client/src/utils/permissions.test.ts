import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { NAV_ITEMS } from '../components/navItems.ts';
import {
  hasAnyPermission,
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
        'Acompanhamento',
        'Avisos de veículos',
        'Cultos',
        'Pedidos de oração',
        'Painéis',
        'Relatórios',
        'Acessos sem login',
        'Igreja',
        'Holyrics',
      ]
    );
    assert.deepEqual(
      NAV_ITEMS.map((item) => item.to),
      [
        '/',
        '/visitantes',
        '/acompanhamento',
        '/avisos-veiculos',
        '/cultos',
        '/oracao',
        '/paineis',
        '/relatorios',
        '/acessos',
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

  test('o proprietário vê todos os itens atuais quando o acompanhamento está ativo', () => {
    for (const item of NAV_ITEMS) {
      assert.equal(
        navItemVisible(item.to, 'owner', permissionsForRole('owner'), { visitorFollowUpEnabled: true }),
        true
      );
    }
  });

  test('o item de acompanhamento some quando a função está desativada', () => {
    assert.equal(navItemVisible('/acompanhamento', 'owner', permissionsForRole('owner')), false);
    assert.equal(
      navItemVisible('/acompanhamento', 'admin', permissionsForRole('admin'), {
        visitorFollowUpEnabled: true,
      }),
      true
    );
    assert.equal(
      navItemVisible('/acompanhamento', 'portaria', permissionsForRole('portaria'), {
        visitorFollowUpEnabled: true,
      }),
      false
    );
  });

  test('cada função vê somente as áreas autorizadas', () => {
    const visible = (role: TeamRole) =>
      NAV_ITEMS.filter((item) => navItemVisible(item.to, role, permissionsForRole(role))).map(
        (item) => item.to
      );

    assert.deepEqual(visible('portaria'), ['/', '/visitantes', '/avisos-veiculos', '/cultos']);
    assert.deepEqual(visible('intercession'), ['/', '/oracao']);
    assert.deepEqual(
      NAV_ITEMS.filter((item) =>
        navItemVisible(item.to, 'intercession', permissionsForRole('intercession'), {
          visitorFollowUpEnabled: true,
        })
      ).map((item) => item.to),
      ['/', '/acompanhamento', '/oracao']
    );
    assert.equal(
      hasAnyPermission(permissionsForRole('intercession'), ['panels:open', 'prayers:project']),
      true
    );
    assert.deepEqual(visible('louvor'), ['/', '/cultos', '/paineis', '/configuracoes']);
    assert.deepEqual(visible('midia'), ['/', '/paineis', '/acessos']);
    assert.ok(visible('admin').includes('/igreja'));
    assert.ok(visible('admin').includes('/configuracoes'));
    assert.ok(visible('admin').includes('/relatorios'));
    assert.equal(visible('portaria').includes('/relatorios'), false);
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
