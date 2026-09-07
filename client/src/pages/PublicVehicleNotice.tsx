import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { BrandMark } from '../components/BrandMark';
import { useBranding } from '../theme/BrandingContext';
import { ThemeToggle } from '../components/ThemeToggle';
import {
  VEHICLE_NOTICE_ACTIONS,
  VEHICLE_NOTICE_ACTION_LABELS,
  type PublicAccessMetadata,
  type VehicleNoticeAction,
} from '../types';
import { isValidVehiclePlate, maskVehiclePlateInput } from '../utils/vehiclePlate';
import { createRequestId } from '../utils/requestId';
import './PublicVehicleNotice.css';
import './PublicAccessMenu.css';

const ACTION_ICONS: Record<VehicleNoticeAction, AppIconName> = {
  remove_vehicle: 'tow',
  turn_off_lights: 'headlight',
  close_door_or_window: 'door',
  reposition_vehicle: 'parking',
  other: 'chat',
};

function VehicleBrand({
  churchName,
  centered = false,
}: {
  churchName: string;
  centered?: boolean;
}) {
  const { branding } = useBranding();
  return (
    <header className={`vehicle-public-brand${centered ? ' centered' : ''}`}>
      <BrandMark name={churchName} logoUrl={branding?.logoUrl} fallbackClassName="vehicle-public-cross" />
      <div>
        <strong>{churchName}</strong>
        <span>Canal oficial de avisos</span>
      </div>
      {!centered && <ThemeToggle compact />}
    </header>
  );
}

export function PublicVehicleSuccess({
  churchName,
  plate,
  vehicleModel,
  action,
  onAgain,
  menuTo,
}: {
  churchName: string;
  plate: string;
  vehicleModel: string;
  action: VehicleNoticeAction;
  onAgain: () => void;
  menuTo?: string;
}) {
  return (
    <main className="public-access-page vehicle-public-page vehicle-success-page">
      <VehicleBrand churchName={churchName} centered />
      <div className="vehicle-success-card card" role="status">
        <span className="vehicle-success-icon">
          <AppIcon name="check" />
        </span>
        <h1>Aviso enviado</h1>
        <p>O responsável pela igreja já pode visualizar sua solicitação.</p>

        <div className="vehicle-success-summary">
          <AppIcon name="car" />
          <div>
            <strong>{plate}</strong>
            <span>{vehicleModel}</span>
            <span>{VEHICLE_NOTICE_ACTION_LABELS[action]}</span>
          </div>
        </div>

        <div className="vehicle-success-privacy">
          <span>
            <AppIcon name="eyeOff" />
          </span>
          <p>Outros avisos não ficam visíveis neste acesso.</p>
        </div>

        <div className="public-success-actions">
          <button type="button" className="public-primary-button" onClick={onAgain}>
            Enviar outro aviso
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

export function PublicVehicleNoticeForm({
  metadata,
  token,
  onSuccess,
  showMenu,
  menuTo,
}: {
  metadata: PublicAccessMetadata;
  token: string;
  showMenu?: boolean;
  menuTo?: string;
  onSuccess: (summary: {
    plate: string;
    vehicleModel: string;
    requestedAction: VehicleNoticeAction;
  }) => void;
}) {
  const requestId = useRef(createRequestId()).current;
  const [plate, setPlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [requestedAction, setRequestedAction] = useState<VehicleNoticeAction>('remove_vehicle');
  const [otherDescription, setOtherDescription] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [plateError, setPlateError] = useState('');
  const [modelError, setModelError] = useState('');
  const [otherError, setOtherError] = useState('');

  const otherRequired = requestedAction === 'other';
  const actionLabel = VEHICLE_NOTICE_ACTION_LABELS[requestedAction];

  const canSubmit = useMemo(() => {
    if (!isValidVehiclePlate(plate) || !vehicleModel.trim()) return false;
    if (otherRequired && !otherDescription.trim()) return false;
    return true;
  }, [plate, vehicleModel, otherDescription, otherRequired]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setPlateError('');
    setModelError('');
    setOtherError('');

    if (!isValidVehiclePlate(plate)) {
      setPlateError('Confira a placa do veículo.');
      return;
    }
    if (!vehicleModel.trim()) {
      setModelError('Informe o modelo ou a descrição do veículo.');
      return;
    }
    if (otherRequired && !otherDescription.trim()) {
      setOtherError('Descreva o que precisa ser feito.');
      return;
    }

    setSubmitting(true);
    try {
      await api.submitPublicVehicleNotice(token, {
        plate,
        vehicleModel: vehicleModel.trim().replace(/\s+/g, ' '),
        requestedAction,
        otherDescription: otherRequired ? otherDescription.trim() : '',
        details: details.trim(),
        requestId,
      });
      onSuccess({
        plate: maskVehiclePlateInput(plate),
        vehicleModel: vehicleModel.trim().replace(/\s+/g, ' '),
        requestedAction,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível enviar o aviso.';
      if (/placa/i.test(message)) setPlateError(message);
      else if (/modelo|descrição/i.test(message)) setModelError(message);
      else if (/precisa ser feito|Descreva/i.test(message)) setOtherError(message);
      else setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="public-access-page vehicle-public-page">
      <VehicleBrand churchName={metadata.churchName} />
      {showMenu && menuTo && (
        <Link to={menuTo} className="public-back-link">
          <AppIcon name="arrow" />
          Voltar ao menu
        </Link>
      )}

      <section className="vehicle-public-hero">
        <span className="vehicle-public-hero-icon" aria-hidden="true">
          <AppIcon name="car" />
        </span>
        <h1>Aviso sobre um carro</h1>
        <p>Informe qual veículo precisa ser avisado.</p>
      </section>

      <div className="vehicle-privacy-banner">
        <span className="vehicle-privacy-icon" aria-hidden="true">
          <AppIcon name="shield" />
        </span>
        <p>O aviso será enviado somente para o responsável da igreja.</p>
      </div>

      <form className="vehicle-public-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}

        <div className="form-group">
          <label htmlFor="vehicle-plate">Placa do veículo</label>
          <div className="vehicle-input-wrap">
            <AppIcon name="plate" />
            <input
              id="vehicle-plate"
              value={plate}
              onChange={(event) => {
                setPlate(maskVehiclePlateInput(event.target.value));
                setPlateError('');
              }}
              placeholder="ABC-1D23"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={8}
              required
              aria-invalid={Boolean(plateError)}
              aria-describedby={plateError ? 'vehicle-plate-error' : undefined}
            />
          </div>
          {plateError && (
            <p id="vehicle-plate-error" className="field-error" role="alert">
              {plateError}
            </p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="vehicle-model">Modelo ou descrição</label>
          <div className="vehicle-input-wrap">
            <AppIcon name="car" />
            <input
              id="vehicle-model"
              value={vehicleModel}
              onChange={(event) => {
                setVehicleModel(event.target.value);
                setModelError('');
              }}
              placeholder="Ex: Gol branco"
              maxLength={120}
              required
              aria-invalid={Boolean(modelError)}
              aria-describedby={modelError ? 'vehicle-model-error' : undefined}
            />
          </div>
          {modelError && (
            <p id="vehicle-model-error" className="field-error" role="alert">
              {modelError}
            </p>
          )}
        </div>

        <fieldset className="vehicle-action-fieldset">
          <legend>O que precisa ser feito?</legend>
          <div className="vehicle-action-list" role="radiogroup" aria-label="Ação solicitada">
            {VEHICLE_NOTICE_ACTIONS.map((action) => {
              const selected = requestedAction === action.value;
              return (
                <button
                  key={action.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`vehicle-action-card${selected ? ' selected' : ''}`}
                  onClick={() => {
                    setRequestedAction(action.value);
                    setOtherError('');
                  }}
                >
                  <AppIcon name={ACTION_ICONS[action.value]} />
                  <span>{action.label}</span>
                  <span className="vehicle-action-check" aria-hidden="true">
                    {selected ? <AppIcon name="checkPlain" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {otherRequired && (
          <div className="form-group">
            <label htmlFor="vehicle-other">Descreva o aviso</label>
            <div className="vehicle-input-wrap vehicle-textarea-wrap">
              <AppIcon name="chat" />
              <textarea
                id="vehicle-other"
                value={otherDescription}
                onChange={(event) => {
                  setOtherDescription(event.target.value);
                  setOtherError('');
                }}
                placeholder="Ex: O alarme está disparando"
                maxLength={240}
                rows={3}
                required
                aria-invalid={Boolean(otherError)}
                aria-describedby={otherError ? 'vehicle-other-error' : undefined}
              />
            </div>
            {otherError && (
              <p id="vehicle-other-error" className="field-error" role="alert">
                {otherError}
              </p>
            )}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="vehicle-details">Observação (opcional)</label>
          <div className="vehicle-input-wrap vehicle-textarea-wrap">
            <AppIcon name="chat" />
            <textarea
              id="vehicle-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Ex: O carro está bloqueando a saída"
              maxLength={500}
              rows={3}
            />
          </div>
        </div>

        <div className="vehicle-summary" aria-live="polite">
          <div className="vehicle-summary-label">
            <AppIcon name="clipboard" />
            Resumo do aviso
          </div>
          <strong>
            {plate || '—'}
            {vehicleModel.trim() ? ` · ${vehicleModel.trim()}` : ''}
          </strong>
          <span>{actionLabel}</span>
        </div>

        <button type="submit" className="public-primary-button" disabled={submitting || !canSubmit}>
          {!submitting && <AppIcon name="send" />}
          {submitting ? 'Enviando...' : 'Enviar aviso'}
        </button>
      </form>
    </main>
  );
}
