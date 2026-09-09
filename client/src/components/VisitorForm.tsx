import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { RELATIONSHIPS, type FollowUpPreset, type Relationship, type VisitKind } from '../types';
import { VisitKindField } from './VisitKindField';
import { todayLocalISO } from '../utils/date';
import { hasPermission } from '../utils/permissions';
import { FOLLOW_UP_PRESET_LABELS, maskPhoneInput, shouldShowFollowUpBlock } from '../utils/visitorFollowUp';
import { AppIcon } from './AppIcon';
import { PanelObservationFields } from './PanelObservationFields';
import { ServiceLinkField } from './ServiceLinkField';
import './VisitorForm.css';

interface Props {
  onSuccess: () => void;
  onViewList?: () => void;
}

interface PersonDraft {
  id: number;
  name: string;
  relationship: Relationship;
  city: string;
  panelObservation: string;
  showObservationOnPanel: boolean;
  includeFollowUp: boolean;
}

interface Assignee {
  id: string;
  name: string;
}

const MAX_VISITORS = 10;

function cleanLine(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
}

function asUpperCase(value: string): string {
  return value.toLocaleUpperCase('pt-BR');
}

function emptyPerson(id: number, city = ''): PersonDraft {
  return {
    id,
    name: '',
    relationship: 'outro',
    city,
    panelObservation: '',
    showObservationOnPanel: false,
    includeFollowUp: false,
  };
}

function personHasData(person: PersonDraft): boolean {
  return Boolean(
    person.name.trim() ||
      person.city.trim() ||
      person.panelObservation.trim() ||
      person.relationship !== 'outro'
  );
}

export function VisitorForm({ onSuccess, onViewList }: Props) {
  const { user } = useAuth();
  const followUpEnabled = shouldShowFollowUpBlock(
    user?.visitorFollowUpEnabled === true,
    hasPermission(user?.permissions, 'follow_up:create') || user?.role === 'owner'
  );
  const nextId = useRef(2);
  const visitDateId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [people, setPeople] = useState<PersonDraft[]>([emptyPerson(1)]);
  const [visitDate, setVisitDate] = useState(todayLocalISO());
  const [visitKind, setVisitKind] = useState<VisitKind | ''>('');
  const [visitKindError, setVisitKindError] = useState('');
  const [nameErrors, setNameErrors] = useState<Record<number, string>>({});
  const [cityErrors, setCityErrors] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [serviceId, setServiceId] = useState<string | undefined>();
  const [includeFollowUp, setIncludeFollowUp] = useState(false);
  const [phone, setPhone] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [firstContact, setFirstContact] = useState<FollowUpPreset>('tomorrow');
  const [firstContactDate, setFirstContactDate] = useState('');
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [focusInvalid, setFocusInvalid] = useState(false);

  useEffect(() => {
    if (!followUpEnabled || !includeFollowUp) return;
    let cancelled = false;
    api
      .getFollowUpAssignees()
      .then((list) => {
        if (!cancelled) setAssignees(list);
      })
      .catch(() => {
        if (!cancelled) setAssignees([]);
      });
    return () => {
      cancelled = true;
    };
  }, [followUpEnabled, includeFollowUp]);

  useEffect(() => {
    if (!focusInvalid) return;
    const field = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    field?.focus();
    setFocusInvalid(false);
  }, [focusInvalid, nameErrors, cityErrors, visitKindError]);

  function updatePerson(id: number, patch: Partial<PersonDraft>) {
    setPeople((prev) => prev.map((person) => (person.id === id ? { ...person, ...patch } : person)));
    if (patch.name != null) {
      setNameErrors((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
    if (patch.city != null) {
      setCityErrors((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  function addPerson() {
    if (people.length >= MAX_VISITORS) return;
    const sharedCity = people.find((person) => person.city.trim())?.city || '';
    setPeople((prev) => [...prev, emptyPerson(nextId.current++, sharedCity)]);
  }

  function removePerson(id: number, index: number) {
    if (index === 0) return;
    const person = people.find((item) => item.id === id);
    if (person && personHasData(person) && !window.confirm('Remover este visitante? Os dados preenchidos serão perdidos.')) {
      return;
    }
    setPeople((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  }

  function resetForm() {
    setPeople([emptyPerson(nextId.current++)]);
    setVisitDate(todayLocalISO());
    setVisitKind('');
    setVisitKindError('');
    setNameErrors({});
    setCityErrors({});
    setIncludeFollowUp(false);
    setPhone('');
    setAssignedToId('');
    setFirstContact('tomorrow');
    setFirstContactDate('');
    setError('');
    setSuccess('');
  }

  function validate(): string | null {
    const nextNameErrors: Record<number, string> = {};
    const nextCityErrors: Record<number, string> = {};
    for (const person of people) {
      if (!cleanLine(person.name)) nextNameErrors[person.id] = 'Informe o nome do visitante.';
      if (!cleanLine(person.city)) nextCityErrors[person.id] = 'Informe a cidade.';
    }
    setNameErrors(nextNameErrors);
    setCityErrors(nextCityErrors);
    const nextVisitKindError = visitKind
      ? ''
      : 'Informe se esta é a primeira visita da família ou grupo.';
    setVisitKindError(nextVisitKindError);
    if (Object.keys(nextNameErrors).length || Object.keys(nextCityErrors).length || nextVisitKindError) {
      return 'Confira os campos destacados antes de cadastrar.';
    }
    if (includeFollowUp && people.length > 1 && !people.some((person) => person.includeFollowUp)) {
      return 'Escolha quem entra no acompanhamento.';
    }
    if (includeFollowUp && firstContact === 'custom' && !firstContactDate) {
      return 'Escolha a data do primeiro contato.';
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setFocusInvalid(true);
      return;
    }

    setLoading(true);
    const selected = people.filter((person) =>
      people.length === 1 ? includeFollowUp : person.includeFollowUp
    );
    const validVisitors = people.map((person) => ({
      name: cleanLine(person.name),
      city: cleanLine(person.city),
      relationship: person.relationship,
      panelObservation: person.panelObservation.trim(),
      showObservationOnPanel: person.showObservationOnPanel,
      visitKind: visitKind as VisitKind,
      ...(followUpEnabled && includeFollowUp && selected.some((item) => item.id === person.id)
        ? {
            followUp: {
              include: true as const,
              phone: phone.replace(/\D/g, ''),
              assignedToId: assignedToId || undefined,
              firstContact,
              firstContactDate: firstContact === 'custom' ? firstContactDate : undefined,
            },
          }
        : {}),
    }));

    try {
      await api.createVisitor({ visitors: validVisitors, serviceId, visitDate });
      const included = followUpEnabled && includeFollowUp && selected.length > 0;
      resetForm();
      setSuccess(
        included
          ? selected.length === 1
            ? 'Visitante cadastrado e incluído no acompanhamento.'
            : 'Visitantes cadastrados e incluídos no acompanhamento.'
          : validVisitors.length === 1
            ? 'Visitantes cadastrados com sucesso.'
            : 'Visitantes cadastrados com sucesso.'
      );
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cadastrar os visitantes.');
    } finally {
      setLoading(false);
    }
  }

  const submitLabel =
    people.length === 1 ? 'Cadastrar visitantes' : `Cadastrar ${people.length} visitantes`;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="visitor-form" noValidate>
      <div className="visitor-page-heading">
        <div>
          <h1>Cadastrar visitantes</h1>
          <p>Registre quem chegou e organize o acolhimento.</p>
        </div>
        {onViewList && (
          <button type="button" className="visitor-secondary-action" onClick={onViewList}>
            <AppIcon name="users" />
            Ver visitantes
          </button>
        )}
      </div>

      <div className="visitor-feedback" aria-live="polite">
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {success && <p className="success-message">{success}</p>}
      </div>

      <section className="visitor-section card" aria-labelledby="visitor-visit-title">
        <div className="visitor-section-heading">
          <span className="visitor-section-icon" aria-hidden="true">
            <AppIcon name="calendar" />
          </span>
          <div>
            <span className="visitor-section-eyebrow">Dados da visita</span>
            <h2 id="visitor-visit-title">Informações do culto</h2>
          </div>
        </div>

        <div className="visitor-field-grid">
          <ServiceLinkField value={serviceId} onChange={setServiceId} label="Culto" />
          <div className="visitor-field">
            <label htmlFor={visitDateId}>Data da visita</label>
            <input
              id={visitDateId}
              type="date"
              value={visitDate}
              onChange={(event) => setVisitDate(event.target.value)}
            />
          </div>
        </div>
        <VisitKindField
          id="visitor-family-kind"
          value={visitKind}
          onChange={(value) => {
            setVisitKind(value);
            setVisitKindError('');
          }}
          disabled={loading}
          error={visitKindError}
        />
      </section>

      {people.map((person, index) => {
        const nameId = `visitor-name-${person.id}`;
        const cityId = `visitor-city-${person.id}`;
        const relationId = `visitor-relation-${person.id}`;
        const fieldError = nameErrors[person.id];
        const cityError = cityErrors[person.id];

        return (
          <section key={person.id} className="visitor-section card" aria-labelledby={`visitor-title-${person.id}`}>
            <div className="visitor-person-row-top">
              <h2 id={`visitor-title-${person.id}`}>Visitante {index + 1}</h2>
              {index > 0 && (
                <button
                  type="button"
                  className="visitor-remove-icon"
                  onClick={() => removePerson(person.id, index)}
                  aria-label={`Remover visitante ${index + 1}`}
                >
                  <AppIcon name="trash" />
                </button>
              )}
            </div>

            <div className={`visitor-field${fieldError ? ' has-error' : ''}`}>
              <label htmlFor={nameId}>Nome completo</label>
              <input
                id={nameId}
                value={person.name}
                onChange={(e) => updatePerson(person.id, { name: asUpperCase(e.target.value) })}
                placeholder="Digite o nome do visitante"
                autoComplete="name"
                autoCapitalize="characters"
                className="visitor-input-uppercase"
                maxLength={120}
                aria-invalid={Boolean(fieldError)}
              />
              {fieldError && (
                <p className="visitor-field-error" role="alert">
                  {fieldError}
                </p>
              )}
            </div>

            <div className="visitor-field-grid">
              <div className="visitor-field">
                <label htmlFor={relationId}>Parentesco</label>
                <select
                  id={relationId}
                  value={person.relationship}
                  onChange={(e) =>
                    updatePerson(person.id, { relationship: e.target.value as Relationship })
                  }
                >
                  {RELATIONSHIPS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={`visitor-field${cityError ? ' has-error' : ''}`}>
                <label htmlFor={cityId}>Cidade</label>
                <input
                  id={cityId}
                  value={person.city}
                  onChange={(e) => updatePerson(person.id, { city: asUpperCase(e.target.value) })}
                  placeholder="Cidade de origem"
                  autoComplete="address-level2"
                  autoCapitalize="characters"
                  className="visitor-input-uppercase"
                  maxLength={100}
                  aria-invalid={Boolean(cityError)}
                />
                {cityError && (
                  <p className="visitor-field-error" role="alert">
                    {cityError}
                  </p>
                )}
              </div>
            </div>

            <PanelObservationFields
              id={`visitor-observation-${person.id}`}
              observation={person.panelObservation}
              showOnPanel={person.showObservationOnPanel}
              disabled={loading}
              onObservationChange={(value) => updatePerson(person.id, { panelObservation: value })}
              onShowChange={(value) => updatePerson(person.id, { showObservationOnPanel: value })}
            />

            {followUpEnabled && includeFollowUp && people.length > 1 && (
              <label className="visitor-follow-check">
                <input
                  type="checkbox"
                  checked={person.includeFollowUp}
                  onChange={(event) => updatePerson(person.id, { includeFollowUp: event.target.checked })}
                />
                Incluir {person.name.trim() || `visitante ${index + 1}`} no acompanhamento
              </label>
            )}
          </section>
        );
      })}

      <button
        type="button"
        className="visitor-add"
        onClick={addPerson}
        disabled={people.length >= MAX_VISITORS || loading}
      >
        <AppIcon name="plus" />
        {people.length >= MAX_VISITORS ? 'Limite de 10 pessoas atingido' : 'Adicionar outra pessoa'}
      </button>

      {followUpEnabled && (
        <section className="visitor-section card visitor-follow-card" aria-labelledby="visitor-follow-title">
          <div className="visitor-follow-heading">
            <span className="visitor-section-icon" aria-hidden="true">
              <AppIcon name="heartHand" />
            </span>
            <div>
              <h2 id="visitor-follow-title">Acompanhamento</h2>
              <p>A equipe poderá entrar em contato depois da visita.</p>
            </div>
            <label className="visitor-follow-switch">
              <span>Incluir no acompanhamento</span>
              <input
                type="checkbox"
                checked={includeFollowUp}
                onChange={(event) => {
                  setIncludeFollowUp(event.target.checked);
                  if (!event.target.checked) {
                    setPeople((prev) => prev.map((person) => ({ ...person, includeFollowUp: false })));
                  }
                }}
              />
            </label>
          </div>

          {includeFollowUp && (
            <>
              <div className="visitor-field">
                <label htmlFor="follow-up-phone">Telefone / WhatsApp</label>
                <input
                  id="follow-up-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="(00) 00000-0000"
                  value={phone}
                  onChange={(event) => setPhone(maskPhoneInput(event.target.value))}
                />
              </div>
              <div className="visitor-field-grid">
                <div className="visitor-field">
                  <label htmlFor="follow-up-assignee">Responsável</label>
                  <select
                    id="follow-up-assignee"
                    value={assignedToId}
                    onChange={(event) => setAssignedToId(event.target.value)}
                  >
                    <option value="">Definir depois</option>
                    {assignees.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                  {assignees.length === 0 && (
                    <p className="visitor-field-hint">Nenhum responsável disponível no momento.</p>
                  )}
                </div>
                <div className="visitor-field">
                  <label htmlFor="follow-up-when">Primeiro contato</label>
                  <select
                    id="follow-up-when"
                    value={firstContact}
                    onChange={(event) => setFirstContact(event.target.value as FollowUpPreset)}
                  >
                    {(Object.keys(FOLLOW_UP_PRESET_LABELS) as FollowUpPreset[]).map((key) => (
                      <option key={key} value={key}>
                        {FOLLOW_UP_PRESET_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {firstContact === 'custom' && (
                <div className="visitor-field">
                  <label htmlFor="follow-up-date">Data do primeiro contato</label>
                  <input
                    id="follow-up-date"
                    type="date"
                    value={firstContactDate}
                    onChange={(event) => setFirstContactDate(event.target.value)}
                  />
                </div>
              )}
              <p className="visitor-follow-privacy">
                <AppIcon name="info" />
                Telefone, responsável e primeiro contato valem para todas as pessoas marcadas.
                O primeiro contato padrão é amanhã.
              </p>
            </>
          )}
        </section>
      )}

      <div className="visitor-submit-row">
        <button type="button" className="visitor-cancel" onClick={resetForm} disabled={loading}>
          Cancelar
        </button>
        <button type="submit" className="visitor-submit" disabled={loading}>
          {!loading && <AppIcon name="check" />}
          {loading ? 'Cadastrando...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
