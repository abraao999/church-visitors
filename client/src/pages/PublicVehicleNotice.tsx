import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { ThemeToggle } from '../components/ThemeToggle';
import {
  VEHICLE_NOTICE_ACTIONS,
  VEHICLE_NOTICE_ACTION_LABELS,
  type PublicAccessMetadata,
  type VehicleNoticeAction,
} from '../types';
import { isValidVehiclePlate, maskVehiclePlateInput } from '../utils/vehiclePlate';
import './PublicVehicleNotice.css';

const ACTION_ICONS: Record<VehicleNoticeAction, AppIconName> = {
  remove_vehicle: 'tow',
  turn_off_lights: 'headlight',
  close_door_or_window: 'door',
  reposition_vehicle: 'parking',
  other: 'chat',
};

function VehicleBrand({ churchName }: { churchName: string }) {
  return (
    <header className="vehicle-public-brand">
      <span className="vehicle-public-cross" aria-hidden="true">
        ✝
      </span>
      <div>
        <strong>{churchName}</strong>
        <span>Canal oficial de avisos</span>
      </div>
      <ThemeToggle compact />
    </header>
  );
}

export function PublicVehicleSuccess({
  churchName,
  plate,
  vehicleModel,
  action,
  onAgain,
}: {
  churchName: string;
  plate: string;
  vehicleModel: string;
  action: VehicleNoticeAction;
  onAgain: () => void;
}) {
  return (
    <main className="public-access-page vehicle-public-page">
      <VehicleBrand churchName={churchName} />
      <div className="vehicle-success-card card" role="status">
        <span className="vehicle-success-icon">
          <AppIcon name="check" />
        </span>
        <h1>Aviso enviado</h1>
        <p>
          O responsável da <strong>{churchName}</strong> recebeu as informações do veículo.
        </p>

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

        <button type="button" className="public-primary-button" onClick={onAgain}>
          Enviar outro aviso
        </button>

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
}: {
  metadata: PublicAccessMetadata;
  token: string;
  onSuccess: (summary: {
    plate: string;
    vehicleModel: string;
    requestedAction: VehicleNoticeAction;
  }) => void;
}) {
  const [plate, setPlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [requestedAction, setRequestedAction] = useState<VehicleNoticeAction>('remove_vehicle');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [plateError, setPlateError] = useState('');

  const detailsRequired = requestedAction === 'other';
  const actionLabel = VEHICLE_NOTICE_ACTION_LABELS[requestedAction];

  const canSubmit = useMemo(() => {
    if (!isValidVehiclePlate(plate) || !vehicleModel.trim()) return false;
    if (detailsRequired && !details.trim()) return false;
    return true;
  }, [plate, vehicleModel, details, detailsRequired]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setPlateError('');

    if (!isValidVehiclePlate(plate)) {
      setPlateError('Confira a placa do veículo.');
      return;
    }
    if (detailsRequired && !details.trim()) {
      setError('Descreva o aviso na observação.');
      return;
    }

    setSubmitting(true);
    try {
      await api.submitPublicVehicleNotice(token, {
        plate,
        vehicleModel: vehicleModel.trim().replace(/\s+/g, ' '),
        requestedAction,
        details: details.trim(),
      });
      onSuccess({
        plate: maskVehiclePlateInput(plate),
        vehicleModel: vehicleModel.trim().replace(/\s+/g, ' '),
        requestedAction,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível enviar o aviso.';
      if (/placa/i.test(message)) setPlateError(message);
      else setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="public-access-page vehicle-public-page">
      <VehicleBrand churchName={metadata.churchName} />

      <section className="vehicle-public-hero">
        <span className="vehicle-public-hero-icon" aria-hidden="true">
          <AppIcon name="car" />
        </span>
        <h1>Aviso sobre um carro</h1>
        <p>Informe qual veículo precisa ser avisado.</p>
      </section>

      <div className="vehicle-privacy-banner">
        <AppIcon name="shield" />
        <span>O aviso será enviado somente para o responsável da igreja.</span>
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
            />
          </div>
          {plateError && (
            <p className="field-error" role="alert">
              {plateError}
            </p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="vehicle-model">Modelo e cor do veículo</label>
          <div className="vehicle-input-wrap">
            <AppIcon name="car" />
            <input
              id="vehicle-model"
              value={vehicleModel}
              onChange={(event) => setVehicleModel(event.target.value)}
              placeholder="Ex: Gol branco"
              maxLength={120}
              required
            />
          </div>
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
                  onClick={() => setRequestedAction(action.value)}
                >
                  <AppIcon name={ACTION_ICONS[action.value]} />
                  <span>{action.label}</span>
                  <span className="vehicle-action-check" aria-hidden="true">
                    {selected ? <AppIcon name="check" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="form-group">
          <label htmlFor="vehicle-details">
            Observação {detailsRequired ? '' : '(opcional)'}
          </label>
          <div className="vehicle-input-wrap vehicle-textarea-wrap">
            <AppIcon name="chat" />
            <textarea
              id="vehicle-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Ex: O carro está bloqueando a saída"
              maxLength={500}
              rows={3}
              required={detailsRequired}
            />
          </div>
        </div>

        <div className="vehicle-summary" aria-live="polite">
          <div className="vehicle-summary-label">
            <AppIcon name="info" />
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
