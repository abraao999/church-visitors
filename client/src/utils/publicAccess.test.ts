import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  accessEntryPath,
  findLivePrayerAccess,
  isLivePrayerAccess,
  livePrayerFormPath,
  livePrayerObsPath,
  typeFromPublicPath,
} from './publicAccess.ts';
import { projectionPrivacyHint } from './prayerPrivacy.ts';

const root = dirname(fileURLToPath(import.meta.url));
const clientSrc = join(root, '..');

describe('acesso de oração da live', () => {
  test('reconhece somente o acesso exclusivo de pedidos de oração', () => {
    assert.equal(isLivePrayerAccess({ types: ['prayers:create'] }), true);
    assert.equal(isLivePrayerAccess({ type: 'prayers:create', types: [] }), true);
    assert.equal(
      isLivePrayerAccess({ types: ['visitors:create', 'prayers:create'] }),
      false
    );
    assert.equal(isLivePrayerAccess({ types: ['visitors:create'] }), false);
  });

  test('prefere o QR da live ativo e ainda válido', () => {
    const chosen = findLivePrayerAccess([
      { types: ['prayers:create'], active: false },
      {
        types: ['prayers:create'],
        active: true,
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    ]);
    assert.equal(chosen?.active, true);
  });

  test('QR de um único formulário aponta direto para a página, sem menu', () => {
    assert.equal(accessEntryPath('abc', ['prayers:create']), '/acesso/abc/oracao');
    assert.equal(accessEntryPath('abc', ['visitors:create']), '/acesso/abc/visitantes');
    assert.equal(
      accessEntryPath('abc', ['visitors:create', 'prayers:create']),
      '/acesso/abc'
    );
    assert.equal(accessEntryPath('tv', ['panels:read']), '/painel/tv');
  });

  test('rotas abertas da live e da sobreposição do OBS ficam estáveis', () => {
    assert.equal(livePrayerFormPath('abc'), '/acesso/abc/oracao');
    assert.equal(livePrayerObsPath('abc'), '/acesso/abc/obs');
    assert.equal(typeFromPublicPath('/acesso/abc/oracao'), 'prayers:create');
    assert.equal(typeFromPublicPath('/live/abc/oracao'), 'prayers:create');
    assert.equal(typeFromPublicPath('/acesso/abc/obs'), null);
  });

  test('o app expõe a rota aberta, o alias da live e a sobreposição do OBS', () => {
    const app = readFileSync(join(clientSrc, 'App.tsx'), 'utf8');
    const nav = readFileSync(join(clientSrc, 'components/navItems.ts'), 'utf8');
    assert.match(app, /\/acesso\/:token\/obs/);
    assert.match(app, /\/live\/:token\/oracao/);
    assert.match(app, /LivePrayerObsPage/);
    assert.equal(nav.includes('/live'), false);
    assert.equal(nav.includes('/acesso/:token/obs'), false);
  });
});

describe('interruptores de privacidade do pedido público', () => {
  test('as quatro combinações descrevem o telão sem criar campos novos', () => {
    assert.equal(
      projectionPrivacyHint(false, false),
      'Seu pedido ficará visível somente para os responsáveis.'
    );
    assert.equal(
      projectionPrivacyHint(true, false),
      'Seu pedido ficará visível somente para os responsáveis.'
    );
    assert.equal(
      projectionPrivacyHint(false, true),
      'Será exibido com seu primeiro nome durante o culto.'
    );
    assert.equal(
      projectionPrivacyHint(true, true),
      'Será exibido como “Anônimo” durante o culto.'
    );
    assert.equal(projectionPrivacyHint(undefined as unknown as boolean, undefined as unknown as boolean), 'Seu pedido ficará visível somente para os responsáveis.');
  });

  test('o formulário público usa interruptores independentes e o contrato atual', () => {
    const page = readFileSync(join(clientSrc, 'pages/PublicAccessPage.tsx'), 'utf8');
    const css = readFileSync(join(clientSrc, 'pages/PublicAccessPage.css'), 'utf8');
    const prayerForm = readFileSync(join(clientSrc, 'components/PrayerForm.tsx'), 'utf8');
    const app = readFileSync(join(clientSrc, 'App.tsx'), 'utf8');
    const nav = readFileSync(join(clientSrc, 'components/navItems.ts'), 'utf8');

    assert.match(page, /role="switch"/);
    assert.match(page, /isAnonymous: anonymous === true/);
    assert.match(page, /allowProjection: allowProjection === true/);
    assert.match(page, /if \(next\) setName\(''\)/);
    assert.equal(page.includes('type="radio"'), false);
    assert.match(css, /width:\s*58px/);
    assert.match(css, /height:\s*34px/);
    assert.match(css, /width:\s*22px/);
    assert.match(css, /appearance:\s*none/);
    assert.match(css, /prefers-reduced-motion/);
    assert.match(prayerForm, /anonymous-switch/);
    assert.match(app, /\/acesso\/:token\/oracao/);
    assert.equal(nav.includes('PublicPrivacySwitch'), false);
  });
});
