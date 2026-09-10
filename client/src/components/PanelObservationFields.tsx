import { AppIcon } from './AppIcon';
import './PanelObservationFields.css';

export const PANEL_OBSERVATION_MAX = 80;

interface Props {
  id: string;
  observation: string;
  showOnPanel: boolean;
  disabled?: boolean;
  onObservationChange: (value: string) => void;
  onShowChange: (value: boolean) => void;
}

export function PanelObservationFields({
  id,
  observation,
  showOnPanel,
  disabled,
  onObservationChange,
  onShowChange,
}: Props) {
  return (
    <div className="panel-observation-fields">
      <label htmlFor={id}>Observação para o painel</label>
      <textarea
        id={id}
        value={observation}
        onChange={(event) => onObservationChange(event.target.value.slice(0, PANEL_OBSERVATION_MAX))}
        maxLength={PANEL_OBSERVATION_MAX}
        rows={2}
        disabled={disabled}
        placeholder="Ex.: aniversário hoje"
      />
      <p className="panel-observation-hint">
        Esse texto será projetado publicamente no telão quando a autorização estiver ativa.
        Máximo de {PANEL_OBSERVATION_MAX} caracteres.
      </p>
      <label className="panel-observation-switch">
        <input
          type="checkbox"
          checked={showOnPanel}
          disabled={disabled}
          onChange={(event) => onShowChange(event.target.checked)}
        />
        <span className="panel-observation-switch-control" aria-hidden="true" />
        <span>
          <strong>
            <AppIcon name="panels" />
            Mostrar no painel da TV
          </strong>
          <small>A observação só aparece no telão quando isso estiver ligado.</small>
        </span>
      </label>
    </div>
  );
}
