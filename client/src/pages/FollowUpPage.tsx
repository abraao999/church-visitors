import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import { useAuth } from '../auth/AuthContext';
import type { FollowUpListItem, FollowUpPreset, FollowUpSummary, FollowUpVisitorOption } from '../types';
import { hasPermission } from '../utils/permissions';
import {
  FOLLOW_UP_PRESET_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  maskPhoneInput,
  nextContactLabel,
  visitDateLabel,
} from '../utils/visitorFollowUp';
import { FollowUpContactModal } from '../components/FollowUpContactModal';
import { FollowUpHistoryModal } from '../components/FollowUpHistoryModal';
import './FollowUpPage.css';
import '../components/FollowUpModals.css';

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'awaiting', label: 'Aguardando' },
  { id: 'today', label: 'Hoje' },
  { id: 'integrating', label: 'Em integração' },
] as const;

export function FollowUpPage() {
  const { user } = useAuth();
  const canCreate = hasPermission(user?.permissions, 'follow_up:create') || user?.role === 'owner';
  const canContact = hasPermission(user?.permissions, 'follow_up:contact') || user?.role === 'owner';
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<(typeof FILTERS)[number]['id']>('all');
  const [summary, setSummary] = useState<FollowUpSummary>({ awaiting: 0, today: 0, integrating: 0 });
  const [items, setItems] = useState<FollowUpListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contactItem, setContactItem] = useState<FollowUpListItem | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [visitorQuery, setVisitorQuery] = useState('');
  const [visitorOptions, setVisitorOptions] = useState<FollowUpVisitorOption[]>([]);
  const [selectedVisitorId, setSelectedVisitorId] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newPreset, setNewPreset] = useState<FollowUpPreset>('tomorrow');
  const [newDate, setNewDate] = useState('');
  const [assignees, setAssignees] = useState<Array<{ id: string; name: string }>>([]);
  const [createError, setCreateError] = useState('');
  const [savingCreate, setSavingCreate] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await api.getFollowUps({ q: query.trim() || undefined, status });
      setSummary(data.summary);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o acompanhamento.');
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!creating) return;
    let cancelled = false;
    Promise.all([
      api.getAvailableFollowUpVisitors(visitorQuery),
      api.getFollowUpAssignees(),
    ])
      .then(([visitors, people]) => {
        if (cancelled) return;
        setVisitorOptions(visitors);
        setAssignees(people);
      })
      .catch((err) => {
        if (!cancelled) {
          setCreateError(err instanceof Error ? err.message : 'Não foi possível carregar os visitantes.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [creating, visitorQuery]);

  async function createFollowUp(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedVisitorId) {
      setCreateError('Escolha um visitante desta igreja.');
      return;
    }
    setSavingCreate(true);
    setCreateError('');
    try {
      await api.createFollowUp({
        visitorId: selectedVisitorId,
        phone: newPhone.replace(/\D/g, '') || undefined,
        assignedToId: newAssignee || undefined,
        firstContact: newPreset,
        firstContactDate: newPreset === 'custom' ? newDate : undefined,
      });
      setCreating(false);
      setSelectedVisitorId('');
      setNewPhone('');
      setNewAssignee('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Não foi possível criar o acompanhamento.');
    } finally {
      setSavingCreate(false);
    }
  }

  return (
    <div className="follow-up-page">
      <section className="follow-up-hero">
        <div>
          <span className="follow-up-eyebrow">Acolhimento</span>
          <h1>Acompanhamento de visitantes</h1>
          <p>Organize os contatos e ajude cada visitante a se sentir bem-vindo.</p>
        </div>
        <p className="follow-up-lock">
          <AppIcon name="lock" />
          Somente equipe autorizada
        </p>
      </section>

      <div className="follow-up-stats">
        <article className="card follow-up-stat">
          <span className="follow-up-stat-icon awaiting"><AppIcon name="users" /></span>
          <strong>{summary.awaiting}</strong>
          <span>Aguardando contato</span>
        </article>
        <article className="card follow-up-stat">
          <span className="follow-up-stat-icon today"><AppIcon name="clock" /></span>
          <strong>{summary.today}</strong>
          <span>Para falar hoje</span>
        </article>
        <article className="card follow-up-stat">
          <span className="follow-up-stat-icon integrating"><AppIcon name="heartHand" /></span>
          <strong>{summary.integrating}</strong>
          <span>Em integração</span>
        </article>
      </div>

      <div className="follow-up-toolbar">
        <label className="follow-up-search">
          <AppIcon name="search" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar visitante"
          />
        </label>
        <div className="follow-up-filters" role="group" aria-label="Filtros">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={status === filter.id ? 'active' : ''}
              onClick={() => setStatus(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        {canCreate && (
          <button type="button" className="btn btn-primary follow-up-new" onClick={() => setCreating(true)}>
            <AppIcon name="plus" />
            Novo acompanhamento
          </button>
        )}
      </div>

      {error && <p className="error-message" role="alert">{error}</p>}

      <section className="follow-up-list" aria-labelledby="follow-up-list-title">
        <h2 id="follow-up-list-title">Próximos contatos</h2>
        {loading ? (
          <div className="card"><p className="empty-state">Carregando acompanhamentos...</p></div>
        ) : items.length === 0 ? (
          <div className="card"><p className="empty-state">Nenhum visitante neste filtro no momento.</p></div>
        ) : (
          <ul>
            {items.map((item, index) => (
              <li key={item.id} className="card follow-up-item">
                <div className="follow-up-person">
                  <span className="follow-up-avatar" aria-hidden="true"><AppIcon name="user" /></span>
                  <div>
                    <strong>{item.visitorName}</strong>
                    <p>
                      {item.city || 'Cidade não informada'}
                      {item.visitDate ? ` • Visitou em ${visitDateLabel(item.visitDate)}` : ''}
                    </p>
                    <span className={`follow-up-status ${item.status}`}>
                      {FOLLOW_UP_STATUS_LABELS[item.status]}
                    </span>
                  </div>
                </div>
                <div className="follow-up-meta">
                  <span>{item.assignedToName || 'Sem responsável'}</span>
                  <strong className={item.nextContactIsToday ? 'is-today' : ''}>
                    {nextContactLabel(item.nextContactAt, item.nextContactIsToday)}
                  </strong>
                </div>
                <div className="follow-up-actions">
                  {canContact && (
                    <button
                      type="button"
                      className={index === 0 ? 'btn btn-primary' : 'btn btn-secondary'}
                      onClick={() => setContactItem(item)}
                    >
                      Registrar contato
                    </button>
                  )}
                  <button type="button" className="follow-up-history" onClick={() => setHistoryId(item.id)}>
                    Ver histórico
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {creating && (
        <div className="follow-up-modal-backdrop" role="presentation" onClick={() => setCreating(false)}>
          <form
            className="card follow-up-create"
            role="dialog"
            aria-labelledby="follow-up-create-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={createFollowUp}
          >
            <h2 id="follow-up-create-title">Novo acompanhamento</h2>
            <p>Selecione somente um visitante desta igreja.</p>
            {createError && <p className="error-message" role="alert">{createError}</p>}
            <label className="visitor-field">
              Buscar visitante
              <input
                value={visitorQuery}
                onChange={(event) => setVisitorQuery(event.target.value)}
                placeholder="Nome do visitante"
              />
            </label>
            <label className="visitor-field">
              Visitante
              <select value={selectedVisitorId} onChange={(event) => setSelectedVisitorId(event.target.value)} required>
                <option value="">Escolha um visitante</option>
                {visitorOptions.map((visitor) => (
                  <option key={visitor.id} value={visitor.id}>
                    {visitor.name} {visitor.city ? `• ${visitor.city}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {visitorOptions.length === 0 && (
              <p className="visitor-field-hint">Não há visitantes disponíveis para novo acompanhamento.</p>
            )}
            <label className="visitor-field">
              Telefone / WhatsApp
              <input
                type="tel"
                inputMode="numeric"
                value={newPhone}
                onChange={(event) => setNewPhone(maskPhoneInput(event.target.value))}
                placeholder="(00) 00000-0000"
              />
            </label>
            <label className="visitor-field">
              Responsável
              <select value={newAssignee} onChange={(event) => setNewAssignee(event.target.value)}>
                <option value="">Definir depois</option>
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>
            </label>
            <label className="visitor-field">
              Primeiro contato
              <select value={newPreset} onChange={(event) => setNewPreset(event.target.value as FollowUpPreset)}>
                {(Object.keys(FOLLOW_UP_PRESET_LABELS) as FollowUpPreset[]).map((key) => (
                  <option key={key} value={key}>{FOLLOW_UP_PRESET_LABELS[key]}</option>
                ))}
              </select>
            </label>
            {newPreset === 'custom' && (
              <label className="visitor-field">
                Data
                <input type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} />
              </label>
            )}
            <div className="follow-up-create-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={savingCreate}>
                {savingCreate ? 'Salvando...' : 'Incluir no acompanhamento'}
              </button>
            </div>
          </form>
        </div>
      )}

      {contactItem && (
        <FollowUpContactModal
          item={contactItem}
          onClose={() => setContactItem(null)}
          onSaved={() => {
            setContactItem(null);
            void load();
          }}
        />
      )}
      {historyId && (
        <FollowUpHistoryModal id={historyId} onClose={() => setHistoryId(null)} />
      )}
    </div>
  );
}
