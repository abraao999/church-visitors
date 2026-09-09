import { useId, useRef, useState } from 'react';
import { api } from '../api/client';
import { AppIcon } from './AppIcon';
import { PanelObservationFields } from './PanelObservationFields';
import { ServiceLinkField } from './ServiceLinkField';
import './VisitorForm.css';

interface Props {
  onSuccess: () => void;
}

interface PersonDraft {
  id: number;
  name: string;
  panelObservation: string;
  showObservationOnPanel: boolean;
}

const MAX_VISITORS = 10;

function cleanLine(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
}

function asUpperCase(value: string): string {
  return value.toLocaleUpperCase('pt-BR');
}

export function VisitorForm({ onSuccess }: Props) {
  const nextId = useRef(2);
  const cityFieldId = useId();
  const [city, setCity] = useState('');
  const [people, setPeople] = useState<PersonDraft[]>([
    { id: 1, name: '', panelObservation: '', showObservationOnPanel: false },
  ]);
  const [cityError, setCityError] = useState('');
  const [nameErrors, setNameErrors] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [serviceId, setServiceId] = useState<string | undefined>();

  function updatePerson(id: number, name: string) {
    setPeople((prev) =>
      prev.map((person) => (person.id === id ? { ...person, name: asUpperCase(name) } : person))
    );
    setNameErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function addPerson() {
    if (people.length >= MAX_VISITORS) return;
    setPeople((prev) => [
      ...prev,
      { id: nextId.current++, name: '', panelObservation: '', showObservationOnPanel: false },
    ]);
  }

  function removePerson(id: number) {
    setPeople((prev) => (prev.length > 1 ? prev.filter((person) => person.id !== id) : prev));
    setNameErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function validate(): boolean {
    const nextCityError = cleanLine(city) ? '' : 'Informe a cidade.';
    const nextNameErrors: Record<number, string> = {};

    for (const person of people) {
      if (!cleanLine(person.name)) {
        nextNameErrors[person.id] = 'Informe o nome do visitante.';
      }
    }

    setCityError(nextCityError);
    setNameErrors(nextNameErrors);
    return !nextCityError && Object.keys(nextNameErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!validate()) {
      setError('Confira os campos destacados antes de cadastrar.');
      return;
    }

    setLoading(true);
    const sharedCity = cleanLine(city);
    const validVisitors = people.map((person) => ({
      name: cleanLine(person.name),
      city: sharedCity,
      relationship: 'outro' as const,
      panelObservation: person.panelObservation.trim(),
      showObservationOnPanel: person.showObservationOnPanel,
    }));

    try {
      await api.createVisitor({ visitors: validVisitors, serviceId });
      setCity('');
      setPeople([
        { id: nextId.current++, name: '', panelObservation: '', showObservationOnPanel: false },
      ]);
      setCityError('');
      setNameErrors({});
      setSuccess(
        validVisitors.length === 1
          ? 'Visitante cadastrado'
          : `${validVisitors.length} visitantes cadastrados`
      );
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cadastrar os visitantes.');
    } finally {
      setLoading(false);
    }
  }

  const submitLabel =
    people.length === 1
      ? 'Cadastrar visitante'
      : `Cadastrar ${people.length} visitantes`;

  return (
    <form onSubmit={handleSubmit} className="visitor-form" noValidate>
      <div className="visitor-feedback" aria-live="polite">
        {error && <p className="error-message" role="alert">{error}</p>}
        {success && <p className="success-message">{success}</p>}
      </div>

      <section className="visitor-section card" aria-labelledby="visitor-visit-title">
        <div className="visitor-section-heading">
          <span className="visitor-section-icon" aria-hidden="true">
            <AppIcon name="pin" />
          </span>
          <div>
            <h2 id="visitor-visit-title">Informações da visita</h2>
          </div>
        </div>

        <ServiceLinkField value={serviceId} onChange={setServiceId} />

        <div className={`visitor-field${cityError ? ' has-error' : ''}`}>
          <label htmlFor={cityFieldId}>Cidade da visita *</label>
          <div className="visitor-input-with-icon">
            <AppIcon name="pin" />
            <input
              id={cityFieldId}
              value={city}
              onChange={(e) => {
                setCity(asUpperCase(e.target.value));
                if (cityError) setCityError('');
              }}
              placeholder="Ex.: UMUARAMA"
              autoComplete="address-level2"
              autoCapitalize="characters"
              className="visitor-input-uppercase"
              maxLength={100}
              aria-invalid={Boolean(cityError)}
              aria-describedby={cityError ? `${cityFieldId}-error` : `${cityFieldId}-hint`}
            />
          </div>
          {cityError ? (
            <p id={`${cityFieldId}-error`} className="visitor-field-error" role="alert">
              {cityError}
            </p>
          ) : (
            <p id={`${cityFieldId}-hint`} className="visitor-field-hint">
              Esta cidade será aplicada a todos os visitantes cadastrados.
            </p>
          )}
        </div>
      </section>

      <section className="visitor-section card" aria-labelledby="visitor-people-title">
        <div className="visitor-section-heading">
          <span className="visitor-section-icon" aria-hidden="true">
            <AppIcon name="users" />
          </span>
          <div>
            <h2 id="visitor-people-title">Pessoas</h2>
            <p>Digite o nome completo de cada pessoa que está visitando.</p>
          </div>
        </div>

        <div className="visitor-people-list">
          {people.map((person, index) => {
            const nameId = `visitor-name-${person.id}`;
            const fieldError = nameErrors[person.id];

            return (
              <div key={person.id} className="visitor-person-row">
                <div className="visitor-person-row-top">
                  <span className="visitor-person-badge" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3 id={`visitor-title-${person.id}`}>Visitante {index + 1}</h3>
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
                    onChange={(e) => updatePerson(person.id, e.target.value)}
                    placeholder="DIGITE O NOME COMPLETO"
                    autoComplete="name"
                    autoCapitalize="characters"
                    className="visitor-input-uppercase"
                    maxLength={120}
                    aria-invalid={Boolean(fieldError)}
                    aria-describedby={fieldError ? `${nameId}-error` : undefined}
                  />
                  {fieldError && (
                    <p id={`${nameId}-error`} className="visitor-field-error" role="alert">
                      {fieldError}
                    </p>
                  )}
                </div>
                <PanelObservationFields
                  id={`visitor-observation-${person.id}`}
                  observation={person.panelObservation}
                  showOnPanel={person.showObservationOnPanel}
                  disabled={loading}
                  onObservationChange={(value) =>
                    setPeople((prev) =>
                      prev.map((item) =>
                        item.id === person.id ? { ...item, panelObservation: value } : item
                      )
                    )
                  }
                  onShowChange={(value) =>
                    setPeople((prev) =>
                      prev.map((item) =>
                        item.id === person.id ? { ...item, showObservationOnPanel: value } : item
                      )
                    )
                  }
                />
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="visitor-add"
          onClick={addPerson}
          disabled={people.length >= MAX_VISITORS || loading}
        >
          <AppIcon name="plus" />
          {people.length >= MAX_VISITORS
            ? 'Limite de 10 pessoas atingido'
            : 'Adicionar outra pessoa'}
        </button>
        <p className="visitor-add-hint">Para famílias ou grupos que chegaram juntos.</p>
      </section>

      <div className="visitor-submit-area">
        <button type="submit" className="visitor-submit" disabled={loading}>
          {!loading && <AppIcon name="check" />}
          {loading ? 'Cadastrando...' : submitLabel}
        </button>
        <p className="visitor-submit-hint">
          <AppIcon name="lock" />
          Os dados poderão ser alterados depois.
        </p>
      </div>
    </form>
  );
}
