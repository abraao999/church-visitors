import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { FollowUpPreset, VisitKind } from '../types';
import { VisitKindField } from './VisitKindField';
import { todayLocalISO } from '../utils/date';
import { hasPermission } from '../utils/permissions';
import { normalizeCityInput } from '../utils/citySuggest';
import { FOLLOW_UP_PRESET_LABELS, maskPhoneInput, shouldShowFollowUpBlock } from '../utils/visitorFollowUp';
import { AppIcon } from './AppIcon';
import { CitySuggestField } from './CitySuggestField';
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

function emptyPerson(id: number): PersonDraft {
  return {
    id,
    name: '',
    panelObservation: '',
    showObservationOnPanel: true,
    includeFollowUp: false,
  };
}

function personHasData(person: PersonDraft): boolean {
  return Boolean(person.name.trim() || person.panelObservation.trim());
}

export function VisitorForm({ onSuccess, onViewList }: Props) {
  const { user } = useAuth();
  const followUpEnabled = shouldShowFollowUpBlock(
    user?.visitorFollowUpEnabled === true,
    hasPermission(user?.permissions, 'follow_up:create') || user?.role === 'owner'
  );
  const nextId = useRef(2);
  const visitDateId = useId();
  const cityId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [people, setPeople] = useState<PersonDraft[]>([emptyPerson(1)]);
  const [visitDate, setVisitDate] = useState(todayLocalISO());
  const [city, setCity] = useState('');
  const [visitKind, setVisitKind] = useState<VisitKind | ''>('');
  const [visitKindError, setVisitKindError] = useState('');
  const [nameErrors, setNameErrors] = useState<Record<number, string>>({});
  const [cityError, setCityError] = useState('');
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
  }, [focusInvalid, nameErrors, cityError, visitKindError]);

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
  }

  function addPerson() {
    if (people.length >= MAX_VISITORS) return;
    setPeople((prev) => [...prev, emptyPerson(nextId.current++)]);
  }

  function removePerson(id: number) {
    if (people.length <= 1) return;
    const person = people.find((item) => item.id === id);
    if (person && personHasData(person) && !window.confirm('Remover este visitante? Os dados preenchidos serão perdidos.')) {
      return;
    }
    setPeople((prev) => prev.filter((item) => item.id !== id));
    setNameErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function resetForm() {
    setPeople([emptyPerson(nextId.current++)]);
    setVisitDate(todayLocalISO());
    setCity('');
    setVisitKind('');
    setVisitKindError('');
    setNameErrors({});
    setCityError('');
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
    for (const person of people) {
      if (!cleanLine(person.name)) nextNameErrors[person.id] = 'Informe o nome do visitante.';
    }
    setNameErrors(nextNameErrors);
    const nextCityError = normalizeCityInput(city) ? '' : 'Informe a cidade da família ou grupo.';
    setCityError(nextCityError);
    const nextVisitKindError = visitKind
      ? ''
      : 'Informe se esta é a primeira visita da família ou grupo.';
    setVisitKindError(nextVisitKindError);
    if (Object.keys(nextNameErrors).length || nextCityError || nextVisitKindError) {
      return 'Confira os campos destacados antes de cadastrar.';
    }
    if (includeFollowUp && people.length > 1 && !people.some((person) => person.includeFollowUp)) {
      return 'Escolha quem entra no acompanhamento.';
    }
    if (includeFollowUp && phone.replace(/\D/g, '').length < 10) {
      return 'Informe o telefone ou WhatsApp para o contato.';
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
    const sharedCity = normalizeCityInput(city);
    const validVisitors = people.map((person) => ({
      name: cleanLine(person.name),
      city: sharedCity,
      relationship: 'outro' as const,
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
            <h2 id="visitor-visit-title">Informações da visita</h2>
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
        <CitySuggestField
          id={cityId}
          label="Cidade da família ou grupo *"
          value={city}
          error={cityError}
          disabled={loading}
          required
          onChange={(value) => {
            setCity(value);
            if (cityError) setCityError('');
          }}
        />
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
        const fieldError = nameErrors[person.id];
        const nameErrorId = `${nameId}-error`;

        return (
          <section key={person.id} className="visitor-section card" aria-labelledby={`visitor-title-${person.id}`}>
            <div className="visitor-person-row-top">
              <span className="visitor-section-icon" aria-hidden="true">
                <AppIcon name="user" />
              </span>
              <h2 id={`visitor-title-${person.id}`}>Visitante {index + 1}</h2>
              {people.length > 1 && (
                <button
                  type="button"
                  className="visitor-remove-icon"
                  onClick={() => removePerson(person.id)}
                  aria-label={`Remover visitante ${index + 1}`}
                >
                  <AppIcon name="trash" />
                </button>
              )}
            </div>

            <div className={`visitor-field${fieldError ? ' has-error' : ''}`}>
              <label htmlFor={nameId}>Nome completo *</label>
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
                aria-describedby={fieldError ? nameErrorId : undefined}
              />
              {fieldError && (
                <p id={nameErrorId} className="visitor-field-error" role="alert">
                  {fieldError}
                </p>
              )}
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
                    <p className="visitor-field-hint">Nenhum integrante de intercessão disponível.</p>
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
