import { useCallback, useEffect, useId, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { useAdminAuth } from './AdminAuthContext';
import { adminApi } from './adminApi';
import { formatAdminDateTime } from './adminFormat';
import type { PlatformAdminList, PlatformAdminRole } from './adminTypes';

const ROLE_HELP: Record<PlatformAdminRole, string> = {
  platform_owner: 'Controle total da plataforma e dos acessos administrativos.',
  support: 'Gerencia igrejas e auxilia responsáveis, sem alterar administradores.',
  viewer: 'Consulta indicadores, igrejas e atividades, sem realizar alterações.',
};

export function AdminAdministratorsPage() {
  const { admin: currentAdmin } = useAdminAuth();
  const titleId = useId();
  const [data, setData] = useState<PlatformAdminList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'support' as PlatformAdminRole });
  const canManage = currentAdmin?.role === 'platform_owner';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setData(await adminApi.admins()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar os administradores.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy('create'); setError(''); setStatus('');
    try {
      await adminApi.createAdmin(form);
      setStatus('Administrador criado. Envie a senha inicial por um canal seguro.');
      setForm({ name: '', email: '', password: '', role: 'support' });
      setModalOpen(false);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível criar o administrador.'); }
    finally { setBusy(''); }
  }

  async function update(id: string, change: { role?: PlatformAdminRole; active?: boolean }, ok: string) {
    setBusy(id); setError(''); setStatus('');
    try { await adminApi.updateAdmin(id, change); setStatus(ok); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível alterar o administrador.'); }
    finally { setBusy(''); }
  }

  const activeCount = data?.items.filter((item) => item.active).length || 0;
  const ownerCount = data?.items.filter((item) => item.active && item.role === 'platform_owner').length || 0;

  return (
    <div>
      <div className="admin-page-heading">
        <div><h1>Administradores</h1><p>Controle quem pode acessar a administração da Eclesiafy.</p></div>
        {canManage && <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}><AppIcon name="plus" /> Novo administrador</button>}
      </div>
      {error && <p className="card admin-error" role="alert">{error}</p>}
      {status && <p className="admin-boot" role="status">{status}</p>}

      <div className="admin-stats admin-admin-stats">
        <article className="card admin-stat"><span>Administradores ativos</span><strong>{loading ? '—' : activeCount}</strong><small>Acesso atual à plataforma</small></article>
        <article className="card admin-stat"><span>Administradores principais</span><strong>{loading ? '—' : ownerCount}</strong><small>Responsáveis pelo controle total</small></article>
        <article className="card admin-stat"><span>Segurança</span><strong className="admin-security-ok"><AppIcon name="shield" /> Protegido</strong><small>Alterações invalidam sessões anteriores</small></article>
      </div>

      <section className="admin-section">
        <div className="admin-list-heading"><div><h2>Equipe administrativa</h2><p>As permissões são determinadas pela função de cada pessoa.</p></div><span className="admin-badge">{data?.items.length || 0} contas</span></div>
        {loading && <p className="admin-boot">Carregando administradores...</p>}
        {!loading && data?.items.length === 0 && <p className="card admin-empty">Nenhum administrador encontrado.</p>}
        {!loading && data && <div className="admin-admin-grid">
          {data.items.map((item) => {
            const isSelf = item.id === currentAdmin?.id;
            return <article key={item.id} className={`card admin-admin-card${item.active ? '' : ' is-inactive'}`}>
              <div className="admin-admin-identity"><span className="admin-admin-avatar">{item.name.charAt(0).toUpperCase()}</span><div><strong>{item.name} {isSelf && <small>Você</small>}</strong><span>{item.email}</span></div><span className={`admin-account-state${item.active ? '' : ' is-off'}`}>{item.active ? 'Ativo' : 'Desativado'}</span></div>
              <div className="admin-admin-role"><label htmlFor={`role-${item.id}`}>Função</label><select id={`role-${item.id}`} value={item.role} disabled={!canManage || isSelf || busy === item.id} onChange={(event) => void update(item.id, { role: event.target.value as PlatformAdminRole }, 'Função atualizada. A sessão anterior foi encerrada.')}><option value="platform_owner">Administrador principal</option><option value="support">Suporte</option><option value="viewer">Somente leitura</option></select><p>{ROLE_HELP[item.role]}</p></div>
              <div className="admin-admin-meta"><span><AppIcon name="clock" /> Último acesso: {formatAdminDateTime(item.lastSeenAt)}</span><span>Criado em {formatAdminDateTime(item.createdAt)}</span></div>
              {canManage && !isSelf && <button type="button" className={`btn admin-account-toggle${item.active ? ' is-danger' : ''}`} disabled={busy === item.id} onClick={() => void update(item.id, { active: !item.active }, item.active ? 'Acesso desativado e sessões encerradas.' : 'Acesso reativado.')}><AppIcon name="power" /> {busy === item.id ? 'Salvando...' : item.active ? 'Desativar acesso' : 'Reativar acesso'}</button>}
            </article>;
          })}
        </div>}
      </section>

      {modalOpen && <div className="admin-dialog-backdrop" role="presentation" onClick={() => setModalOpen(false)}><form className="card admin-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()} onSubmit={create}><div className="admin-dialog-title"><div><h2 id={titleId}>Novo administrador</h2><p>Crie um acesso separado para a equipe da plataforma.</p></div><button type="button" className="btn admin-ghost" aria-label="Fechar" onClick={() => setModalOpen(false)}><AppIcon name="close" /></button></div><div className="form-group"><label htmlFor="admin-name">Nome</label><input id="admin-name" value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} required autoFocus /></div><div className="form-group"><label htmlFor="admin-new-email">E-mail</label><input id="admin-new-email" type="email" value={form.email} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} required /></div><div className="form-group"><label htmlFor="admin-new-role">Função</label><select id="admin-new-role" value={form.role} onChange={(event) => setForm((value) => ({ ...value, role: event.target.value as PlatformAdminRole }))}><option value="support">Suporte</option><option value="viewer">Somente leitura</option></select><small>{ROLE_HELP[form.role]}</small></div><div className="form-group"><label htmlFor="admin-password">Senha inicial</label><input id="admin-password" type="password" value={form.password} onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))} minLength={8} required autoComplete="new-password" /><small>Use ao menos 8 caracteres, incluindo letra e número.</small></div><div className="admin-actions"><button type="submit" className="btn btn-primary" disabled={busy === 'create'}>{busy === 'create' ? 'Criando...' : 'Criar administrador'}</button><button type="button" className="btn" onClick={() => setModalOpen(false)}>Cancelar</button></div></form></div>}
    </div>
  );
}
