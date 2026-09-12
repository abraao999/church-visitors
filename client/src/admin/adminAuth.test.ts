import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { NAV_ITEMS } from '../components/navItems.ts';
import { shouldApplyChurchBranding } from '../utils/branding.ts';
import { canManageChurches, canSupportChurches } from './adminFormat.ts';

const root = dirname(fileURLToPath(import.meta.url));
const clientSrc = join(root, '..');

test('o menu lateral das igrejas não ganhou itens do painel administrativo', () => {
  assert.equal(NAV_ITEMS.some((item) => item.to.startsWith('/admin')), false);
  const layout = readFileSync(join(clientSrc, 'components/Layout.tsx'), 'utf8');
  const nav = readFileSync(join(clientSrc, 'components/navItems.ts'), 'utf8');
  assert.equal(layout.includes('/admin'), false);
  assert.equal(nav.includes('/admin'), false);
  assert.equal(nav.includes('Administração da plataforma'), false);
});

test('rotas administrativas ficam fora do Layout das igrejas', () => {
  const app = readFileSync(join(clientSrc, 'App.tsx'), 'utf8');
  const adminLogin = app.indexOf('path="/admin/login"');
  const adminHome = app.indexOf('path="/admin"');
  const churches = app.indexOf('path="/admin/igrejas"');
  const detail = app.indexOf('path="/admin/igrejas/:churchId"');
  const protectedIndex = app.indexOf('element={<ProtectedRoute');
  const layoutIndex = app.indexOf('element={<Layout />}');
  assert.ok(adminLogin > 0 && adminHome > 0 && churches > 0 && detail > 0);
  assert.ok(adminLogin < protectedIndex);
  assert.ok(adminHome < layoutIndex);
  assert.match(app, /AdminProtectedRoute/);
  assert.match(app, /AdminLayout/);
});

test('identidade da igreja não entra no painel administrativo', () => {
  assert.equal(shouldApplyChurchBranding('/admin'), false);
  assert.equal(shouldApplyChurchBranding('/admin/login'), false);
  assert.equal(shouldApplyChurchBranding('/admin/igrejas/abc'), false);
});

test('papéis administrativos restringem ações sensíveis', () => {
  assert.equal(canManageChurches('viewer'), false);
  assert.equal(canManageChurches('support'), false);
  assert.equal(canManageChurches('platform_owner'), true);
  assert.equal(canSupportChurches('viewer'), false);
  assert.equal(canSupportChurches('support'), true);
});

test('telas administrativas cobrem login, busca, detalhes e confirmação de suspensão', () => {
  const login = readFileSync(join(clientSrc, 'admin/AdminLoginPage.tsx'), 'utf8');
  const churches = readFileSync(join(clientSrc, 'admin/AdminChurchesPage.tsx'), 'utf8');
  const detail = readFileSync(join(clientSrc, 'admin/AdminChurchDetailPage.tsx'), 'utf8');
  const overview = readFileSync(join(clientSrc, 'admin/AdminOverviewPage.tsx'), 'utf8');
  const layout = readFileSync(join(clientSrc, 'admin/AdminLayout.tsx'), 'utf8');
  assert.match(login, /Administração da plataforma/);
  assert.match(login, /Entrando/);
  assert.equal(login.includes('Crie sua conta'), false);
  assert.match(churches, /Digite para buscar/);
  assert.match(churches, /situacao/);
  assert.match(churches, /Carregando igrejas/);
  assert.match(churches, /Nenhuma igreja encontrada/);
  assert.match(detail, /Voltar para igrejas/);
  assert.match(detail, /Digite o nome da igreja para confirmar/);
  assert.match(overview, /Carregando visão geral/);
  assert.match(overview, /Não foi possível carregar/);
  assert.match(churches, /Não foi possível carregar as igrejas/);
  assert.match(detail, /somente consulta/);
  assert.match(layout, /Em breve/);
  assert.match(layout, /aria-expanded/);
});

test('rota /admin sem sessão volta ao login administrativo', () => {
  const guard = readFileSync(join(clientSrc, 'admin/AdminProtectedRoute.tsx'), 'utf8');
  assert.match(guard, /Navigate to="\/admin\/login"/);
  assert.match(guard, /Carregando o painel administrativo/);
});
