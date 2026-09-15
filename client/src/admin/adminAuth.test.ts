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
  const health = app.indexOf('path="/admin/saude"');
  const settings = app.indexOf('path="/admin/configuracoes"');
  const protectedIndex = app.indexOf('element={<ProtectedRoute');
  const layoutIndex = app.indexOf('element={<Layout />}');
  assert.ok(adminLogin > 0 && adminHome > 0 && churches > 0 && detail > 0 && health > 0 && settings > 0);
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
  assert.match(detail, /Aprovar igreja/);
  assert.equal(layout.includes('Em breve'), false);
  assert.match(layout, /\/admin\/configuracoes/);
  assert.match(layout, /platform_owner/);
  assert.match(layout, /aria-expanded/);
});

test('rota /admin sem sessão volta ao login administrativo', () => {
  const guard = readFileSync(join(clientSrc, 'admin/AdminProtectedRoute.tsx'), 'utf8');
  assert.match(guard, /Navigate to="\/admin\/login"/);
  assert.match(guard, /Carregando o painel administrativo/);
});

test('tela de saúde está no menu, protegida e cobre os estados', () => {
  const app = readFileSync(join(clientSrc, 'App.tsx'), 'utf8');
  const layout = readFileSync(join(clientSrc, 'admin/AdminLayout.tsx'), 'utf8');
  const page = readFileSync(join(clientSrc, 'admin/AdminHealthPage.tsx'), 'utf8');
  const types = readFileSync(join(clientSrc, 'admin/adminTypes.ts'), 'utf8');
  const css = readFileSync(join(clientSrc, 'admin/AdminHealthPage.css'), 'utf8');
  const healthIndex = app.indexOf('path="/admin/saude"');
  const protectedIndex = app.indexOf('element={<AdminProtectedRoute');
  assert.ok(healthIndex > protectedIndex);
  assert.match(layout, /to: '\/admin\/saude'/);
  assert.match(layout, /label: 'Saúde'/);
  assert.equal(layout.includes("label: 'Saúde', icon: 'heartHand'"), false);
  assert.match(page, /Atualizando/);
  assert.match(page, /Tentar novamente/);
  assert.match(page, /Nenhum incidente técnico recente/);
  assert.match(types, /Funcionando normalmente/);
  assert.match(types, /Disponível com atenção/);
  assert.match(types, /Indisponibilidade detectada/);
  assert.match(page, /Não configurado/);
  assert.match(page, /aria-live/);
  assert.match(css, /max-width: 520px/);
});

test('configurações da plataforma são exclusivas do administrador principal', () => {
  const app = readFileSync(join(clientSrc, 'App.tsx'), 'utf8');
  const layout = readFileSync(join(clientSrc, 'admin/AdminLayout.tsx'), 'utf8');
  const page = readFileSync(join(clientSrc, 'admin/AdminSettingsPage.tsx'), 'utf8');
  const css = readFileSync(join(clientSrc, 'admin/AdminSettingsPage.css'), 'utf8');
  const api = readFileSync(join(clientSrc, 'admin/adminApi.ts'), 'utf8');
  const types = readFileSync(join(clientSrc, 'admin/adminTypes.ts'), 'utf8');
  const login = readFileSync(join(clientSrc, 'pages/LoginPage.tsx'), 'utf8');
  const churchLayout = readFileSync(join(clientSrc, 'components/Layout.tsx'), 'utf8');
  const settingsIndex = app.indexOf('path="/admin/configuracoes"');
  const ownerIndex = app.indexOf('AdminOwnerRoute');
  const protectedIndex = app.indexOf('element={<AdminProtectedRoute');
  assert.ok(settingsIndex > protectedIndex);
  assert.ok(ownerIndex > 0);
  assert.match(layout, /to: '\/admin\/configuracoes'/);
  assert.match(layout, /label: 'Configurações'/);
  assert.equal(layout.includes('Em breve'), false);
  assert.match(layout, /admin\?\.role === 'platform_owner'/);
  assert.match(page, /Carregando configurações/);
  assert.match(page, /Tentar novamente/);
  assert.match(page, /Salvando/);
  assert.match(page, /Salvar configurações/);
  assert.match(page, /Descartar alterações/);
  assert.match(page, /Há alterações não salvas/);
  assert.equal(page.includes('useBlocker'), false);
  assert.match(page, /role="switch"/);
  assert.match(page, /role="alert"/);
  assert.match(page, /role="status"/);
  assert.match(page, /btn btn-primary/);
  assert.match(css, /background: var\(--primary\)/);
  assert.match(css, /color: var\(--on-primary\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(api, /getSettings/);
  assert.match(api, /updateSettings/);
  assert.match(api, /sendTestEmail/);
  assert.match(api, /approveChurch/);
  assert.match(types, /Aguardando aprovação/);
  assert.match(types, /closedMessage/);
  assert.match(types, /platform_test_email_sent/);
  assert.match(page, /Enviar e-mail de teste/);
  assert.match(page, /Adicionar janela/);
  assert.match(page, /Mensagem quando o cadastro estiver fechado/);
  assert.match(page, /Limites da plataforma/);
  assert.match(page, /Páginas legais/);
  assert.match(page, /Validade do código de confirmação/);
  assert.match(page, /Módulos da nova igreja/);
  assert.match(page, /Aviso institucional/);
  assert.match(login, /Novos cadastros estão temporariamente indisponíveis/);
  assert.match(login, /registrationsEnabled/);
  assert.match(login, /closedMessage/);
  assert.match(login, /auth-legal-note/);
  assert.match(login, /termsUrl/);
  assert.match(login, /auth-platform-notice/);
  assert.match(login, /status.notice/);
  assert.match(churchLayout, /platform-maintenance-banner/);
  assert.match(churchLayout, /platform-notice-banner/);
  assert.match(churchLayout, /platformPublic/);
  assert.equal(churchLayout.includes('/admin/configuracoes'), false);
});
