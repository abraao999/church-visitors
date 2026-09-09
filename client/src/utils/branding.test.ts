import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { NAV_ITEMS } from '../components/navItems.ts';
import {
  contrastRatio,
  deriveBrandCssVars,
  hasCustomBrandColors,
  isAllowedLogoFile,
  parseHexColor,
  shouldApplyChurchBranding,
  validateBrandColor,
} from './branding.ts';

const root = dirname(fileURLToPath(import.meta.url));

describe('identidade visual no cliente', () => {
  test('o menu lateral mantém os mesmos itens, nomes e ordem', () => {
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
      NAV_ITEMS.some((item) => item.to.includes('identidade') || item.label === 'Identidade visual'),
      false
    );
  });

  test('login e convite preservam a identidade geral do sistema', () => {
    assert.equal(shouldApplyChurchBranding('/login'), false);
    assert.equal(shouldApplyChurchBranding('/convite/abc'), false);
    assert.equal(shouldApplyChurchBranding('/'), true);
    assert.equal(shouldApplyChurchBranding('/acesso/token'), true);
    assert.equal(shouldApplyChurchBranding('/igreja/identidade'), true);
  });

  test('igreja antiga sem cores continua no padrão e as cores inválidas são recusadas', () => {
    assert.equal(hasCustomBrandColors({ name: 'Igreja Alfa' }), false);
    assert.equal(deriveBrandCssVars({ name: 'Igreja Alfa' }, 'light'), null);
    assert.equal(parseHexColor('#2563eb'), '#2563EB');
    assert.match(validateBrandColor('#FFF').error || '', /hexadecimal/i);
    assert.match(validateBrandColor('#777777').error || '', /contraste/i);
  });

  test('tema claro e escuro mantêm texto legível nos botões personalizados', () => {
    const branding = { name: 'Igreja Alfa', primaryColor: '#0F766E', accentColor: '#C2410C' };
    for (const theme of ['light', 'dark'] as const) {
      const vars = deriveBrandCssVars(branding, theme);
      assert.ok(vars);
      assert.ok(contrastRatio(vars['--primary'], vars['--on-primary']) >= 4.5);
      assert.ok(contrastRatio(vars['--accent'], theme === 'dark' ? '#12151C' : '#F8F6F2') >= 3);
    }
  });

  test('SVG e arquivo maior que 2 MB são recusados no cliente', () => {
    const svg = isAllowedLogoFile({ name: 'marca.svg', type: 'image/svg+xml', size: 100 } as File);
    assert.equal('error' in svg, true);
    const huge = isAllowedLogoFile({ name: 'logo.png', type: 'image/png', size: 2 * 1024 * 1024 + 1 } as File);
    assert.equal('error' in huge, true);
    const ok = isAllowedLogoFile({ name: 'logo.webp', type: 'image/webp', size: 2048 } as File);
    assert.deepEqual(ok, { ok: true });
  });
});

describe('layout sem rolagem horizontal no celular', () => {
  test('as telas de identidade e o casco do app bloqueiam overflow-x', () => {
    const brandingCss = readFileSync(join(root, '../pages/ChurchBrandingPage.css'), 'utf8');
    const layoutCss = readFileSync(join(root, '../components/Layout.css'), 'utf8');
    const indexCss = readFileSync(join(root, '../index.css'), 'utf8');
    assert.match(brandingCss, /overflow-x:\s*hidden/);
    assert.match(brandingCss, /max-width:\s*960px/);
    assert.match(brandingCss, /grid-template-columns:\s*1fr/);
    assert.match(layoutCss, /overflow-x:\s*hidden/);
    assert.match(layoutCss, /\.nav-desktop[\s\S]*overflow-y:\s*auto/);
    assert.match(indexCss, /overflow-x:\s*hidden/);
  });
});
