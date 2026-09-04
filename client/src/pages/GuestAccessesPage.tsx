import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AppIcon } from '../components/AppIcon';
import { GuestAccessQr, guestAccessUrl } from '../components/GuestAccessQr';
import type { GuestAccess, GuestAccessType } from '../types';
import './GuestAccessesPage.css';

const ACCESS_COPY: Record<GuestAccessType, { title: string; permission: string }> = {
  'visitors:create': {
    title: 'Equipe da portaria',
    permission: 'Cadastrar visitantes',
  },
  'prayers:create': {
    title: 'Pedidos de oração',
    permission: 'Enviar pedidos de oração',
  },
};

function dateTimeLocalValue(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value?: string): string {
  if (!value) return 'Sem data definida';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function accessStatus(access: GuestAccess): { label: string; className: string } {
  if (!access.active) return { label: 'Desativado', className: 'inactive' };
  if (access.expiresAt && new Date(access.expiresAt).getTime() <= Date.now()) {
    return { label: 'Expirado', className: 'expired' };
  }
  return { label: 'Ativo', className: 'active' };
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function GuestAccessesPage() {
  const { user } = useAuth();
  const [accesses, setAccesses] = useState<GuestAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GuestAccess | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<GuestAccessType>('visitors:create');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const loadAccesses = useCallback(async () => {
    setError('');
    try {
      setAccesses(await api.getGuestAccesses());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar acessos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccesses();
  }, [loadAccesses]);

  function openCreate(defaultType: GuestAccessType = 'visitors:create') {
    setEditing(null);
    setType(defaultType);
    setName(defaultType === 'visitors:create' ? 'Portaria — culto' : 'Oração — transmissão');
    setExpiresAt('');
    setError('');
    setFeedback('');
    setFormOpen(true);
  }

  function openEdit(access: GuestAccess) {
    setEditing(access);
    setType(access.type);
    setName(access.name);
    setExpiresAt(dateTimeLocalValue(access.expiresAt));
    setError('');
    setFeedback('');
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const payload = {
        name,
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      };
      if (editing) {
        const updated = await api.updateGuestAccess(editing.id, payload);
        setAccesses((current) => current.map((item) => item.id === updated.id ? updated : item));
        setFeedback('Acesso atualizado com sucesso.');
      } else {
        const created = await api.createGuestAccess({ ...payload, type });
        setAccesses((current) => [created, ...current]);
        setFeedback('Acesso criado. O link e o QR Code já podem ser compartilhados.');
      }
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o acesso');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(access: GuestAccess, action: 'deactivate' | 'reactivate' | 'renew') {
    if (
      action === 'deactivate' &&
      !window.confirm(`Desativar “${access.name}”? O link e o QR Code deixarão de funcionar.`)
    ) return;
    if (
      action === 'renew' &&
      !window.confirm(`Gerar um novo link para “${access.name}”? O link anterior será invalidado imediatamente.`)
    ) return;

    setBusyId(access.id);
    setError('');
    setFeedback('');
    try {
      const updated = action === 'deactivate'
        ? await api.deactivateGuestAccess(access.id)
        : action === 'reactivate'
          ? await api.reactivateGuestAccess(access.id)
          : await api.renewGuestAccess(access.id);
      setAccesses((current) => current.map((item) => item.id === updated.id ? updated : item));
      setFeedback(
        action === 'renew'
          ? 'Novo link gerado. O endereço anterior não funciona mais.'
          : action === 'deactivate'
            ? 'Acesso desativado.'
            : 'Acesso reativado.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação');
    } finally {
      setBusyId('');
    }
  }

  async function copyAccess(access: GuestAccess) {
    setError('');
    try {
      await copyText(guestAccessUrl(access.token));
      setFeedback(`Link de “${access.name}” copiado.`);
    } catch {
      setError('Não foi possível copiar. Selecione o endereço e copie manualmente.');
    }
  }

  return (
    <div className="guest-access-page">
      <header className="guest-access-heading">
        <div>
          <span className="page-eyebrow"><AppIcon name="lock" /> Compartilhamento seguro</span>
          <h1>Acessos sem login</h1>
          <p>Crie links específicos para quem ajuda na portaria ou envia pedidos de oração.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
          <AppIcon name="plus" /> Criar acesso
        </button>
      </header>

      <div className="guest-access-notice">
        <AppIcon name="lock" />
        <p><strong>Cada acesso possui apenas uma permissão.</strong> Convidados podem enviar informações, mas nunca visualizar registros da {user?.churchName || 'igreja'}.</p>
      </div>

      <div className="guest-access-feedback" aria-live="polite">
        {feedback && <p className="success-message"><AppIcon name="check" />{feedback}</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
      </div>

      {formOpen && (
        <form className="guest-access-form card" onSubmit={submitForm}>
          <div className="guest-access-form-heading">
            <div>
              <h2>{editing ? 'Editar acesso' : 'Novo acesso'}</h2>
              <p>{editing ? 'Altere o nome ou a validade.' : 'Escolha uma única finalidade para este link.'}</p>
            </div>
            <button type="button" onClick={closeForm}>Cancelar</button>
          </div>
          <div className="guest-access-form-grid">
            <div className="form-group">
              <label htmlFor="accessName">Nome do acesso</label>
              <input id="accessName" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
            </div>
            <div className="form-group">
              <label htmlFor="accessType">Permissão</label>
              <select id="accessType" value={type} onChange={(event) => setType(event.target.value as GuestAccessType)} disabled={Boolean(editing)}>
                <option value="visitors:create">Cadastrar visitantes</option>
                <option value="prayers:create">Enviar pedidos de oração</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="accessExpiry">Validade (opcional)</label>
              <input id="accessExpiry" type="datetime-local" value={expiresAt} min={dateTimeLocalValue(new Date().toISOString())} onChange={(event) => setExpiresAt(event.target.value)} />
              <small>Deixe vazio para não definir uma data de expiração.</small>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <AppIcon name="check" /> {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar acesso seguro'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="guest-access-loading">Carregando acessos...</div>
      ) : accesses.length === 0 ? (
        <section className="guest-access-empty card">
          <AppIcon name="qr" />
          <h2>Nenhum acesso criado</h2>
          <p>Escolha qual acesso deseja gerar primeiro. Nada será ativado sem sua confirmação.</p>
          <div>
            <button type="button" className="btn btn-primary" onClick={() => openCreate('visitors:create')}>Gerar acesso da portaria</button>
            <button type="button" className="btn btn-secondary" onClick={() => openCreate('prayers:create')}>Gerar acesso de oração</button>
          </div>
        </section>
      ) : (
        <section className="guest-access-list" aria-label="Acessos criados">
          {accesses.map((access) => {
            const status = accessStatus(access);
            const copy = ACCESS_COPY[access.type];
            const link = guestAccessUrl(access.token);
            return (
              <article className="guest-access-card card" key={access.id}>
                <div className="guest-access-card-main">
                  <div className={`guest-access-type-icon ${access.type === 'prayers:create' ? 'prayer' : ''}`}>
                    <AppIcon name={access.type === 'visitors:create' ? 'users' : 'prayer'} />
                  </div>
                  <div className="guest-access-card-title">
                    <span>{copy.title}</span>
                    <h2>{access.name}</h2>
                    <p>Permissão: {copy.permission.toLowerCase()} · Igreja: {user?.churchName || 'sua igreja'}</p>
                  </div>
                  <span className={`guest-access-status ${status.className}`}>{status.label}</span>
                </div>

                <div className="guest-access-card-content">
                  <GuestAccessQr token={access.token} name={access.name} />
                  <div className="guest-access-details">
                    <label htmlFor={`link-${access.id}`}>Link do acesso</label>
                    <input id={`link-${access.id}`} value={link} readOnly onFocus={(event) => event.currentTarget.select()} />
                    <div className="guest-access-meta">
                      <span><AppIcon name="calendar" /><strong>Validade</strong>{access.expiresAt ? formatDate(access.expiresAt) : 'Sem validade'}</span>
                      <span><AppIcon name="clock" /><strong>Última utilização</strong>{access.lastUsedAt ? formatDate(access.lastUsedAt) : 'Ainda não utilizado'}</span>
                    </div>
                    <div className="guest-access-actions">
                      <button type="button" className="guest-action-button primary" onClick={() => copyAccess(access)}><AppIcon name="copy" />Copiar link</button>
                      <button type="button" className="guest-action-button" onClick={() => openEdit(access)}><AppIcon name="edit" />Editar validade</button>
                      <button type="button" className="guest-action-button" onClick={() => runAction(access, 'renew')} disabled={busyId === access.id}><AppIcon name="refresh" />Gerar novo link</button>
                      {access.active ? (
                        <button type="button" className="guest-action-button danger" onClick={() => runAction(access, 'deactivate')} disabled={busyId === access.id}><AppIcon name="power" />Desativar</button>
                      ) : (
                        <button type="button" className="guest-action-button success" onClick={() => runAction(access, 'reactivate')} disabled={busyId === access.id}><AppIcon name="power" />Reativar</button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
