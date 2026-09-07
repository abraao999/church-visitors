import { AppIcon } from '../components/AppIcon';
import type { VehicleAlertPrefs, VehicleAlertVolume, VehicleAlertWhen } from './vehicleAlertConstants';
import './VehicleAlertSettingsModal.css';

interface Props {
  prefs: VehicleAlertPrefs;
  browserState: NotificationPermission | 'unsupported';
  saving: boolean;
  onChange: (prefs: VehicleAlertPrefs) => void;
  onTest: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export function VehicleAlertSettingsModal({
  prefs,
  browserState,
  saving,
  onChange,
  onTest,
  onCancel,
  onSave,
}: Props) {
  function toggle<K extends keyof VehicleAlertPrefs>(key: K, value: VehicleAlertPrefs[K]) {
    onChange({ ...prefs, [key]: value });
  }

  return (
    <div className="recurrence-modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="card vehicle-alert-settings"
        role="dialog"
        aria-labelledby="vehicle-alert-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="vehicle-alert-settings-icon">
          <AppIcon name="bell" />
        </span>
        <h2 id="vehicle-alert-settings-title">Alertas de veículos</h2>
        <p>Escolha como este computador avisa a portaria.</p>

        <label className="vehicle-alert-option">
          <span>
            <strong>Som discreto</strong>
            <small>Reproduzir um toque curto uma vez.</small>
          </span>
          <input
            type="checkbox"
            checked={prefs.sound}
            onChange={(event) => toggle('sound', event.target.checked)}
          />
        </label>
        <label className="vehicle-alert-option">
          <span>
            <strong>Aviso dentro do sistema</strong>
            <small>Mostrar a placa e a ação solicitada.</small>
          </span>
          <input
            type="checkbox"
            checked={prefs.inApp}
            onChange={(event) => toggle('inApp', event.target.checked)}
          />
        </label>
        <label className="vehicle-alert-option">
          <span>
            <strong>Notificação do navegador</strong>
            <small>Avisar quando esta aba estiver em segundo plano.</small>
          </span>
          <input
            type="checkbox"
            checked={prefs.browser}
            onChange={(event) => toggle('browser', event.target.checked)}
            disabled={browserState === 'unsupported'}
          />
        </label>
        <label className="vehicle-alert-option">
          <span>
            <strong>Mostrar a placa na notificação deste computador</strong>
            <small>Desligado por padrão. A placa continua visível dentro do sistema.</small>
          </span>
          <input
            type="checkbox"
            checked={prefs.showPlateInBrowser}
            onChange={(event) => toggle('showPlateInBrowser', event.target.checked)}
            disabled={!prefs.browser}
          />
        </label>

        <fieldset className="vehicle-alert-fieldset">
          <legend>Quando avisar</legend>
          <div className="vehicle-alert-choices">
            {([
              ['service', 'Durante a recepção e o culto'],
              ['always', 'Sempre que o sistema estiver aberto'],
            ] as Array<[VehicleAlertWhen, string]>).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="vehicle-alert-when"
                  checked={prefs.when === value}
                  onChange={() => toggle('when', value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="vehicle-alert-fieldset">
          <legend>Volume</legend>
          <div className="vehicle-alert-choices">
            {([
              ['low', 'Baixo'],
              ['medium', 'Médio'],
              ['high', 'Alto'],
            ] as Array<[VehicleAlertVolume, string]>).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="vehicle-alert-volume"
                  checked={prefs.volume === value}
                  onChange={() => toggle('volume', value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {browserState === 'denied' && (
          <p className="vehicle-alert-denied">
            O navegador bloqueou as notificações. Permita os avisos nas configurações do site se quiser
            recebê-los com a aba em segundo plano.
          </p>
        )}
        {browserState === 'unsupported' && (
          <p className="vehicle-alert-denied">Este navegador não oferece notificações do sistema.</p>
        )}
        <p className="vehicle-alert-local-note">
          Estas configurações valem somente para este computador.
        </p>

        <div className="vehicle-alert-settings-actions">
          <button type="button" className="btn btn-secondary" onClick={onTest}>
            Testar alerta
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={onSave}>
            {prefs.enabled ? 'Salvar configurações' : 'Ativar alertas'}
          </button>
        </div>
      </div>
    </div>
  );
}
