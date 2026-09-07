import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AppIcon } from '../components/AppIcon';
import { PortariaDevicesSection } from '../components/PortariaDevicesSection';
import { GuestAccessQr, guestAccessUrl } from '../components/GuestAccessQr';
import type { GuestAccess, GuestAccessType } from '../types';
import { OPTION_LABELS } from '../utils/publicAccess';
import './GuestAccessesPage.css';

const FORM_OPTIONS: GuestAccessType[] = [
  'visitors:create',
  'prayers:create',
  'vehicle_notices:create',
];

const PANEL_OPTION: GuestAccessType = 'panels:read';

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

function accessTypes(access: GuestAccess): GuestAccessType[] {
  return access.types?.length ? access.types : access.type ? [access.type] : [];
}

function isPanel(access: GuestAccess): boolean {
  return accessTypes(access).includes(PANEL_OPTION);
}

function isPortal(access: GuestAccess): boolean {
  return !isPanel(access) && accessTypes(access).length > 1;
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
  const [types, setTypes] = useState<GuestAccessType[]>([...FORM_OPTIONS]);
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

  const panelSelected = types.includes(PANEL_OPTION);

  /**
   * Painel e formulário não convivem no mesmo link: marcar um lado limpa o
   * outro, para o link do telão nunca chegar à mão do visitante.
   */
  function toggleType(type: GuestAccessType) {
    setTypes((current) => {
      if (current.includes(type)) return current.filter((item) => item !== type);
      if (type === PANEL_OPTION) return [PANEL_OPTION];
      return [...current.filter((item) => item !== PANEL_OPTION), type];
    });
  }

  function openCreate(mode: 'portal' | 'panel' = 'portal') {
    setEditing(null);
    if (mode === 'panel') {
      setTypes([PANEL_OPTION]);
      setName('Painéis da TV');
    } else {
      setTypes([...FORM_OPTIONS]);
      setName('Portal público da igreja');
    }
    setExpiresAt('');
    setError('');
    setFeedback('');
    setFormOpen(true);
  }

  function openEdit(access: GuestAccess) {
    setEditing(access);
    setTypes(accessTypes(access));
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
    if (types.length === 0) {
      setError('Selecione pelo menos uma opção.');
      return;
    }
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const payload = {
        name,
        types,
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      };
      if (editing) {
        const updated = await api.updateGuestAccess(editing.id, payload);
        setAccesses((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setFeedback('Acesso atualizado com sucesso.');
      } else {
        const created = await api.createGuestAccess(payload);
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
      !window.confirm(
        `Desativar “${access.name}”? QR Codes e links já impressos deixarão de funcionar.`
      )
    ) {
      return;
    }
    if (
      action === 'renew' &&
      !window.confirm(
        `Gerar um novo link para “${access.name}”? O QR Code anterior deixará de funcionar imediatamente.`
      )
    ) {
      return;
    }
    if (
      action === 'reactivate' &&
      !window.confirm(
        `Reativar “${access.name}”? Os QR Codes e links atuais voltam a funcionar.`
      )
    ) {
      return;
    }

    setBusyId(access.id);
    setError('');
    setFeedback('');
    try {
      const updated =
        action === 'deactivate'
          ? await api.deactivateGuestAccess(access.id)
          : action === 'reactivate'
            ? await api.reactivateGuestAccess(access.id)
            : await api.renewGuestAccess(access.id);
      setAccesses((current) => current.map((item) => (item.id === updated.id ? updated : item)));
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
      await copyText(guestAccessUrl(access.token, accessTypes(access)));
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
          <p>
            Crie um portal público para os visitantes ou um acesso de leitura para as TVs da igreja.
          </p>
        </div>
        <div className="guest-access-heading-actions">
          <button type="button" className="btn btn-primary" onClick={() => openCreate('portal')}>
            <AppIcon name="plus" /> Criar portal público
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => openCreate('panel')}>
            <AppIcon name="panels" /> Criar acesso de painel
          </button>
        </div>
      </header>

      <PortariaDevicesSection />

      <div className="guest-access-notice">
        <AppIcon name="lock" />
        <p>
          <strong>O convidado nunca vê os registros da {user?.churchName || 'igreja'}.</strong> Cada
          informação enviada fica só com os responsáveis.
        </p>
      </div>

      <div className="guest-access-feedback" aria-live="polite">
        {feedback && (
          <p className="success-message">
            <AppIcon name="check" />
            {feedback}
          </p>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </div>

      {formOpen && (
        <form className="guest-access-form card" onSubmit={submitForm}>
          <div className="guest-access-form-heading">
            <div>
              <h2>{editing ? 'Editar acesso' : 'Novo acesso'}</h2>
              <p>
                {editing
                  ? 'Altere o nome, a validade ou as opções autorizadas.'
                  : 'Escolha o que este QR Code poderá enviar.'}
              </p>
            </div>
            <button type="button" onClick={closeForm}>
              Cancelar
            </button>
          </div>
          <div className="guest-access-form-grid">
            <div className="form-group">
              <label htmlFor="accessName">Nome do acesso</label>
              <input
                id="accessName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                required
              />
            </div>
            <div className="form-group">
              <label>Igreja</label>
              <input value={user?.churchName || ''} readOnly aria-readonly="true" />
              <small>A igreja é definida pela sua sessão e não pode ser escolhida aqui.</small>
            </div>
            <div className="form-group">
              <label htmlFor="accessExpiry">Validade (opcional)</label>
              <input
                id="accessExpiry"
                type="datetime-local"
                value={expiresAt}
                min={dateTimeLocalValue(new Date().toISOString())}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <small>Deixe vazio para não definir uma data de expiração.</small>
            </div>
          </div>
          <fieldset className="guest-access-options">
            <legend>Formulários que o visitante pode enviar</legend>
            {FORM_OPTIONS.map((type) => (
              <label key={type} className="guest-access-option">
                <input
                  type="checkbox"
                  checked={types.includes(type)}
                  onChange={() => toggleType(type)}
                />
                <span>{OPTION_LABELS[type]}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="guest-access-options">
            <legend>Ou exibição nas TVs</legend>
            <label className="guest-access-option">
              <input
                type="checkbox"
                checked={panelSelected}
                onChange={() => toggleType(PANEL_OPTION)}
              />
              <span>{OPTION_LABELS[PANEL_OPTION]}</span>
            </label>
            <small>
              {panelSelected
                ? 'Este link só exibe painéis. Use no computador da TV, não com visitantes.'
                : 'Um mesmo link não pode juntar painel e formulários.'}
            </small>
          </fieldset>
          <button type="submit" className="btn btn-primary" disabled={saving || types.length === 0}>
            <AppIcon name="check" />{' '}
            {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar acesso seguro'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="guest-access-loading">Carregando acessos...</div>
      ) : accesses.length === 0 ? (
        <section className="guest-access-empty card">
          <AppIcon name="qr" />
          <h2>Nenhum acesso criado</h2>
          <p>Crie o portal público da igreja. Nada será ativado sem a sua confirmação.</p>
          <div>
            <button type="button" className="btn btn-primary" onClick={() => openCreate('portal')}>
              Criar portal público
            </button>
          </div>
        </section>
      ) : (
        <section className="guest-access-list" aria-label="Acessos criados">
          {accesses.map((access) => {
            const status = accessStatus(access);
            const currentTypes = accessTypes(access);
            const panel = isPanel(access);
            const portal = isPortal(access);
            const link = guestAccessUrl(access.token, currentTypes);
            return (
              <article className="guest-access-card card" key={access.id}>
                <div className="guest-access-card-main">
                  <div className={`guest-access-type-icon ${panel || portal ? '' : currentTypes[0] === 'prayers:create' ? 'prayer' : ''}`}>
                    <AppIcon name={panel ? 'panels' : portal ? 'qr' : currentTypes[0] === 'prayers:create' ? 'prayer' : currentTypes[0] === 'vehicle_notices:create' ? 'car' : 'users'} />
                  </div>
                  <div className="guest-access-card-title">
                    <span>
                      {panel ? 'Acesso de painel' : portal ? 'Portal público' : 'Acesso específico'}
                    </span>
                    <h2>{access.name}</h2>
                    <p>
                      {currentTypes.map((type) => OPTION_LABELS[type]).join(' · ')} · Igreja:{' '}
                      {user?.churchName || 'sua igreja'}
                    </p>
                  </div>
                  <span className={`guest-access-status ${status.className}`}>{status.label}</span>
                </div>

                <div className="guest-access-card-content">
                  <GuestAccessQr token={access.token} name={access.name} types={currentTypes} />
                  <div className="guest-access-details">
                    <label htmlFor={`link-${access.id}`}>
                      {panel ? 'Link para abrir na TV' : 'Link do acesso'}
                    </label>
                    <input
                      id={`link-${access.id}`}
                      value={link}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <div className="guest-access-meta">
                      <span>
                        <AppIcon name="calendar" />
                        <strong>Validade</strong>
                        {access.expiresAt ? formatDate(access.expiresAt) : 'Sem validade'}
                      </span>
                      <span>
                        <AppIcon name="clock" />
                        <strong>Última utilização</strong>
                        {access.lastUsedAt ? formatDate(access.lastUsedAt) : 'Ainda não utilizado'}
                      </span>
                    </div>
                    <div className="guest-access-actions">
                      <button type="button" className="guest-action-button primary" onClick={() => copyAccess(access)}>
                        <AppIcon name="copy" />
                        Copiar link
                      </button>
                      <button type="button" className="guest-action-button" onClick={() => openEdit(access)}>
                        <AppIcon name="edit" />
                        Editar opções
                      </button>
                      <button
                        type="button"
                        className="guest-action-button"
                        onClick={() => runAction(access, 'renew')}
                        disabled={busyId === access.id}
                      >
                        <AppIcon name="refresh" />
                        Gerar novo link
                      </button>
                      {access.active ? (
                        <button
                          type="button"
                          className="guest-action-button danger"
                          onClick={() => runAction(access, 'deactivate')}
                          disabled={busyId === access.id}
                        >
                          <AppIcon name="power" />
                          Desativar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="guest-action-button success"
                          onClick={() => runAction(access, 'reactivate')}
                          disabled={busyId === access.id}
                        >
                          <AppIcon name="power" />
                          Reativar
                        </button>
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
