import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import { PanelObservationFields } from '../components/PanelObservationFields';
import { BrandMark } from '../components/BrandMark';
import { useBranding } from '../theme/BrandingContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { type PublicAccessMetadata, type VehicleNoticeAction } from '../types';
import {
  isPanelAccessType,
  panelMenuPath,
  publicFormPath,
  publicMenuPath,
  resolvePublicTypes,
  typeFromPublicPath,
} from '../utils/publicAccess';
import { createRequestId } from '../utils/requestId';
import { PublicAccessMenu } from './PublicAccessMenu';
import { PublicVehicleNoticeForm, PublicVehicleSuccess } from './PublicVehicleNotice';
import './PublicAccessPage.css';
import './PublicAccessMenu.css';

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

function ChurchIllustration() {
  return (
    <svg className="public-church-illustration" viewBox="0 0 180 130" aria-hidden="true">
      <path fill="#FFF2C7" d="M20 116h140v8H20z" />
      <path fill="#FFD66B" d="m44 75 46-40 46 40v43H44z" />
      <path fill="#FFF8E4" d="m52 78 38-33 38 33v40H52z" />
      <path fill="#D8921E" d="M79 118V92c0-7 5-12 11-12s11 5 11 12v26z" />
      <path fill="none" stroke="#D8921E" strokeLinecap="round" strokeWidth="6" d="M90 36V12M79 22h22" />
      <circle cx="35" cy="112" r="13" fill="#A6B938" />
      <circle cx="146" cy="113" r="12" fill="#A6B938" />
    </svg>
  );
}

function PublicBrand({
  churchName,
  subtitle = 'Church Visitors',
}: {
  churchName?: string;
  subtitle?: string;
}) {
  const { branding } = useBranding();
  const name = churchName || branding?.name || 'Church Visitors';
  return (
    <header className="public-access-brand">
      <BrandMark name={name} logoUrl={branding?.logoUrl} fallbackClassName="public-access-cross" />
      <div>
        <strong>{name}</strong>
        {churchName && <span>{subtitle}</span>}
      </div>
      <ThemeToggle compact />
    </header>
  );
}

function PublicBackLink({ to }: { to: string }) {
  return (
    <Link to={to} className="public-back-link">
      <AppIcon name="arrow" />
      Voltar ao menu
    </Link>
  );
}

function PublicLoading() {
  return (
    <main className="public-access-page public-access-centered">
      <PublicBrand />
      <div className="public-state-card card" role="status">
        <span className="public-loading-spinner" aria-hidden="true" />
        <h1>Verificando acesso</h1>
        <p>Aguarde um instante.</p>
      </div>
    </main>
  );
}

function PublicUnavailable({ retry }: { retry: () => void }) {
  return (
    <main className="public-access-page public-access-centered">
      <PublicBrand />
      <div className="public-state-card card" role="alert">
        <span className="public-state-icon invalid"><AppIcon name="lock" /></span>
        <h1>Acesso indisponível</h1>
        <p>Este acesso não está ativo. Solicite um novo QR Code ao responsável pela igreja.</p>
        <button type="button" className="public-secondary-button" onClick={retry}>
          Tentar novamente
        </button>
      </div>
    </main>
  );
}

function PublicInvalid({ message, retry }: { message: string; retry: () => void }) {
  return (
    <main className="public-access-page public-access-centered">
      <PublicBrand />
      <div className="public-state-card card" role="alert">
        <span className="public-state-icon invalid"><AppIcon name="lock" /></span>
        <h1>Este acesso não é mais válido</h1>
        <p>{message}</p>
        <p className="public-state-help">Solicite um novo QR Code à sua igreja.</p>
        <button type="button" className="public-secondary-button" onClick={retry}>
          Tentar novamente
        </button>
      </div>
    </main>
  );
}

function PublicSuccess({
  type,
  churchName,
  onAgain,
  menuTo,
}: {
  type: PublicAccessMetadata['type'];
  churchName: string;
  onAgain: () => void;
  menuTo?: string;
}) {
  const visitors = type === 'visitors:create';
  return (
    <main className="public-access-page public-access-centered">
      <PublicBrand churchName={churchName} />
      <div className="public-state-card public-success-card card" role="status">
        <span className="public-state-icon success"><AppIcon name="check" /></span>
        <span className="public-success-label">Envio concluído</span>
        <h1>{visitors ? 'Visitantes registrados' : 'Pedido enviado'}</h1>
        <p>
          {visitors
            ? <>As informações foram enviadas com sucesso para <strong>{churchName}</strong>.</>
            : <>Seu pedido foi recebido pela <strong>{churchName}</strong>.</>}
        </p>
        <div className="public-privacy-box">
          <AppIcon name="lock" />
          <span>
            {visitors
              ? 'Por segurança, os registros enviados não são exibidos neste acesso.'
              : 'Por segurança, os pedidos enviados não são exibidos neste acesso.'}
          </span>
        </div>
        <div className="public-success-actions">
          <button type="button" className="public-primary-button" onClick={onAgain}>
            <AppIcon name={visitors ? 'users' : 'prayer'} />
            {visitors ? 'Registrar outro visitante' : 'Enviar outro pedido'}
          </button>
          {menuTo && (
            <Link to={menuTo} className="public-secondary-button">
              Voltar ao menu
            </Link>
          )}
        </div>
        <p className="vehicle-success-footnote">
          <AppIcon name="info" /> Você já pode fechar esta página.
        </p>
      </div>
    </main>
  );
}

function PublicVisitorsForm({
  metadata,
  token,
  onSuccess,
  showMenu,
}: {
  metadata: PublicAccessMetadata;
  token: string;
  onSuccess: () => void;
  showMenu: boolean;
}) {
  const requestId = useRef(createRequestId()).current;
  const nextId = useRef(2);
  const [city, setCity] = useState('');
  const [people, setPeople] = useState<PersonDraft[]>([
    { id: 1, name: '', panelObservation: '', showObservationOnPanel: false },
  ]);
  const [cityError, setCityError] = useState('');
  const [nameErrors, setNameErrors] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function updatePerson(id: number, name: string) {
    setPeople((current) =>
      current.map((person) => (person.id === id ? { ...person, name: asUpperCase(name) } : person))
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
    setPeople((current) => [
      ...current,
      { id: nextId.current++, name: '', panelObservation: '', showObservationOnPanel: false },
    ]);
  }

  function removePerson(id: number) {
    setPeople((current) => (current.length > 1 ? current.filter((person) => person.id !== id) : current));
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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError('');

    if (!validate()) {
      setError('Confira os campos destacados antes de cadastrar.');
      return;
    }

    setSubmitting(true);
    const sharedCity = cleanLine(city);
    try {
      await api.submitPublicVisitors(
        token,
        people.map((person) => ({
          name: cleanLine(person.name),
          city: sharedCity,
          relationship: 'outro',
          panelObservation: person.panelObservation.trim(),
          showObservationOnPanel: person.showObservationOnPanel,
        })),
        requestId
      );
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar as informações.');
    } finally {
      setSubmitting(false);
    }
  }

  const submitLabel =
    people.length === 1
      ? 'Cadastrar visitante'
      : `Cadastrar ${people.length} visitantes`;

  return (
    <main className="public-access-page">
      <PublicBrand churchName={metadata.churchName} subtitle="Acesso da igreja" />
      {showMenu && <PublicBackLink to={publicMenuPath(token)} />}
      <section className="public-access-hero visitors">
        <div>
          <span className="public-access-badge"><AppIcon name="users" /> Acesso da equipe da portaria</span>
          <h1>Registrar visitantes</h1>
          <p>Preencha os dados das pessoas que estão nos visitando.</p>
        </div>
        <ChurchIllustration />
      </section>

      <div className="public-access-permission">
        <AppIcon name="lock" />
        <p>Você pode cadastrar visitantes, mas não pode visualizar os registros.</p>
      </div>

      <form className="public-access-form" onSubmit={submit} noValidate>
        <div className="public-form-feedback" aria-live="polite">
          {error && <p role="alert">{error}</p>}
        </div>

        <section className="public-person-card card">
          <div className="public-section-heading">
            <AppIcon name="pin" />
            <h2>Informações da visita</h2>
          </div>
          <div className={`public-field${cityError ? ' has-error' : ''}`}>
            <label htmlFor="public-visit-city">Cidade da visita *</label>
            <input
              id="public-visit-city"
              value={city}
              onChange={(event) => {
                setCity(asUpperCase(event.target.value));
                if (cityError) setCityError('');
              }}
              placeholder="Ex.: UMUARAMA"
              maxLength={100}
              autoComplete="address-level2"
              autoCapitalize="characters"
              className="public-input-uppercase"
              aria-invalid={Boolean(cityError)}
              aria-describedby={cityError ? 'public-visit-city-error' : 'public-visit-city-hint'}
            />
            {cityError ? (
              <p id="public-visit-city-error" className="public-field-error" role="alert">{cityError}</p>
            ) : (
              <p id="public-visit-city-hint" className="public-field-hint">Esta cidade será aplicada a todos os visitantes cadastrados.</p>
            )}
          </div>
        </section>

        <section className="public-person-card card">
          <div className="public-section-heading">
            <AppIcon name="users" />
            <div>
              <h2>Pessoas</h2>
              <p>Digite o nome completo de cada pessoa que está visitando.</p>
            </div>
          </div>

          {people.map((person, index) => {
            const nameId = `visitor-name-${person.id}`;
            const fieldError = nameErrors[person.id];
            return (
              <div className="public-person-row" key={person.id}>
                <div className="public-person-row-top">
                  <span className="public-person-badge">{index + 1}</span>
                  <strong>Visitante {index + 1}</strong>
                  {people.length > 1 && (
                    <button
                      type="button"
                      className="public-remove-icon"
                      onClick={() => removePerson(person.id)}
                      aria-label={`Remover visitante ${index + 1}`}
                    >
                      <AppIcon name="trash" />
                    </button>
                  )}
                </div>
                <div className={`public-field${fieldError ? ' has-error' : ''}`}>
                  <label htmlFor={nameId}>Nome completo *</label>
                  <input
                    id={nameId}
                    value={person.name}
                    onChange={(event) => updatePerson(person.id, event.target.value)}
                    placeholder="DIGITE O NOME COMPLETO"
                    maxLength={120}
                    autoComplete="name"
                    autoCapitalize="characters"
                    className="public-input-uppercase"
                    aria-invalid={Boolean(fieldError)}
                    aria-describedby={fieldError ? `${nameId}-error` : undefined}
                  />
                  {fieldError && (
                    <p id={`${nameId}-error`} className="public-field-error" role="alert">
                      {fieldError}
                    </p>
                  )}
                </div>
                <PanelObservationFields
                  id={`public-observation-${person.id}`}
                  observation={person.panelObservation}
                  showOnPanel={person.showObservationOnPanel}
                  disabled={submitting}
                  onObservationChange={(value) =>
                    setPeople((current) =>
                      current.map((item) =>
                        item.id === person.id ? { ...item, panelObservation: value } : item
                      )
                    )
                  }
                  onShowChange={(value) =>
                    setPeople((current) =>
                      current.map((item) =>
                        item.id === person.id ? { ...item, showObservationOnPanel: value } : item
                      )
                    )
                  }
                />
              </div>
            );
          })}

          <button
            type="button"
            className="public-add-button dashed"
            onClick={addPerson}
            disabled={people.length >= MAX_VISITORS || submitting}
          >
            <AppIcon name="plus" />
            {people.length >= MAX_VISITORS ? 'Limite de 10 pessoas atingido' : 'Adicionar outra pessoa'}
          </button>
          <p className="public-field-hint centered">Para famílias ou grupos que chegaram juntos.</p>
        </section>

        <button type="submit" className="public-primary-button" disabled={submitting}>
          {!submitting && <AppIcon name="check" />}
          {submitting ? 'Cadastrando...' : submitLabel}
        </button>
        <p className="public-submit-note"><AppIcon name="lock" /> Os dados poderão ser alterados depois.</p>
      </form>
    </main>
  );
}

function PublicPrayerForm({
  metadata,
  token,
  onSuccess,
  showMenu,
}: {
  metadata: PublicAccessMetadata;
  token: string;
  onSuccess: () => void;
  showMenu: boolean;
}) {
  const requestId = useRef(createRequestId()).current;
  const [anonymous, setAnonymous] = useState(false);
  const [allowProjection, setAllowProjection] = useState(false);
  const [name, setName] = useState('');
  const [request, setRequest] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await api.submitPublicPrayer(token, {
        name: anonymous ? '' : name,
        request,
        isAnonymous: anonymous,
        allowProjection,
        requestId,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="public-access-page">
      <PublicBrand churchName={metadata.churchName} subtitle="Acesso da igreja" />
      {showMenu && <PublicBackLink to={publicMenuPath(token)} />}
      <section className="public-access-hero prayer">
        <span className="public-prayer-icon"><AppIcon name="prayer" /></span>
        <span className="public-access-badge"><AppIcon name="check" /> Canal oficial de oração</span>
        <h1>Pedido de oração</h1>
        <p>Compartilhe seu pedido com a equipe da igreja.</p>
      </section>

      <div className="public-access-permission">
        <AppIcon name="lock" />
        <p>
          Seu pedido fica com o responsável da igreja. Ele só aparece no telão se você autorizar
          abaixo.
        </p>
      </div>

      <form className="public-prayer-card card" onSubmit={submit}>
        <div className="public-form-feedback" aria-live="polite">
          {error && (
            <p id="public-prayer-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <label className="public-anonymous-control">
          <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} />
          <span className="public-switch" aria-hidden="true" />
          <span><strong>Manter meu nome em sigilo</strong><small>Seu pedido aparecerá como “Anônimo”.</small></span>
        </label>

        <label className="public-anonymous-control">
          <input
            type="checkbox"
            checked={allowProjection}
            onChange={(event) => setAllowProjection(event.target.checked)}
          />
          <span className="public-switch" aria-hidden="true" />
          <span>
            <strong>Autorizo exibir no telão</strong>
            <small>
              {anonymous
                ? 'Seu pedido pode ser projetado durante o culto, sem o seu nome.'
                : 'Seu pedido pode ser projetado durante o culto, com o seu primeiro nome.'}
            </small>
          </span>
        </label>

        {!anonymous && (
          <div className="public-field">
            <label htmlFor="public-prayer-name">Nome</label>
            <input
              id="public-prayer-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Digite seu nome"
              maxLength={120}
              autoComplete="name"
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'public-prayer-error' : undefined}
            />
          </div>
        )}
        <div className="public-field">
          <div className="public-field-heading">
            <label htmlFor="public-prayer-request">Pedido de oração</label>
            <span>{request.length}/2000</span>
          </div>
          <textarea
            id="public-prayer-request"
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            placeholder="Escreva aqui seu pedido de oração"
            maxLength={2000}
            rows={6}
            required
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'public-prayer-error' : undefined}
          />
        </div>
        <button type="submit" className="public-primary-button" disabled={submitting}>
          {!submitting && <AppIcon name="prayer" />}
          {submitting ? 'Enviando...' : 'Enviar pedido'}
        </button>
      </form>
      <p className="public-submit-note"><AppIcon name="lock" /> Ambiente seguro da sua igreja</p>
    </main>
  );
}

export function PublicAccessPage() {
  const { token = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { setPublicBranding } = useBranding();
  const [metadata, setMetadata] = useState<PublicAccessMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [vehicleSummary, setVehicleSummary] = useState<{
    plate: string;
    vehicleModel: string;
    requestedAction: VehicleNoticeAction;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setMetadata(await api.getPublicAccess(token));
    } catch (err) {
      setMetadata(null);
      setError(err instanceof Error ? err.message : 'Não foi possível validar este acesso.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!metadata) {
      setPublicBranding(null);
      return;
    }
    setPublicBranding({
      name: metadata.churchName,
      logoUrl: metadata.logoUrl,
      primaryColor: metadata.primaryColor,
      accentColor: metadata.accentColor,
    });
    return () => setPublicBranding(null);
  }, [metadata, setPublicBranding]);

  useEffect(() => {
    setSuccess(false);
    setVehicleSummary(null);
  }, [location.pathname]);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  const section = typeFromPublicPath(location.pathname);
  const types = metadata ? resolvePublicTypes(metadata.types, metadata.type) : [];
  const showMenu = types.length > 1;
  const menuTo = showMenu ? publicMenuPath(token) : undefined;
  const deniedMessage =
    (location.state as { optionDenied?: boolean } | null)?.optionDenied
      ? 'Esta opção não está disponível neste acesso.'
      : undefined;

  if (loading) return <PublicLoading />;
  if (!metadata) return <PublicInvalid message={error} retry={load} />;
  if (types.length === 0) return <PublicUnavailable retry={load} />;

  // Link de painel usado no endereço de formulário: manda para os painéis.
  if (types.some(isPanelAccessType)) {
    return <Navigate to={panelMenuPath(token)} replace />;
  }

  if (section === 'menu') {
    if (types.length === 1) {
      return <Navigate to={publicFormPath(token, types[0])} replace />;
    }
    return (
      <PublicAccessMenu
        token={token}
        churchName={metadata.churchName}
        types={types}
        deniedMessage={deniedMessage}
      />
    );
  }

  const formType = section;
  if (!formType || !types.includes(formType)) {
    if (showMenu) {
      return (
        <Navigate
          to={publicMenuPath(token)}
          replace
          state={{ optionDenied: true }}
        />
      );
    }
    return (
      <PublicInvalid
        message="Esta opção não está disponível neste acesso."
        retry={() => navigate(publicFormPath(token, types[0]), { replace: true })}
      />
    );
  }

  const formMetadata: PublicAccessMetadata = { ...metadata, type: formType, types };

  if (success && formType === 'vehicle_notices:create' && vehicleSummary) {
    return (
      <PublicVehicleSuccess
        churchName={metadata.churchName}
        plate={vehicleSummary.plate}
        vehicleModel={vehicleSummary.vehicleModel}
        action={vehicleSummary.requestedAction}
        menuTo={menuTo}
        onAgain={() => {
          setSuccess(false);
          setVehicleSummary(null);
        }}
      />
    );
  }

  if (success) {
    return (
      <PublicSuccess
        type={formType}
        churchName={metadata.churchName}
        menuTo={menuTo}
        onAgain={() => setSuccess(false)}
      />
    );
  }

  if (formType === 'visitors:create') {
    return (
      <PublicVisitorsForm
        metadata={formMetadata}
        token={token}
        showMenu={showMenu}
        onSuccess={() => setSuccess(true)}
      />
    );
  }

  if (formType === 'vehicle_notices:create') {
    return (
      <PublicVehicleNoticeForm
        metadata={formMetadata}
        token={token}
        showMenu={showMenu}
        menuTo={menuTo}
        onSuccess={(summary) => {
          setVehicleSummary(summary);
          setSuccess(true);
        }}
      />
    );
  }

  return (
    <PublicPrayerForm
      metadata={formMetadata}
      token={token}
      showMenu={showMenu}
      onSuccess={() => setSuccess(true)}
    />
  );
}
