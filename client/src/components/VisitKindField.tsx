import type { VisitKind } from '../types';
import './VisitKindField.css';

interface Props {
  id: string;
  value: VisitKind | '';
  onChange: (value: VisitKind) => void;
  disabled?: boolean;
  error?: string;
}

export function VisitKindField({ id, value, onChange, disabled, error }: Props) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={`visit-kind-field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>Esta é a primeira visita desta família ou grupo? *</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : hintId}
        onChange={(event) => onChange(event.target.value as VisitKind)}
      >
        <option value="" disabled>Selecione uma opção</option>
        <option value="first">Sim, é a primeira visita</option>
        <option value="returning">Não, já visitaram antes</option>
        <option value="unknown">Não soube informar</option>
      </select>
      {error ? (
        <p id={errorId} className="visit-kind-error" role="alert">{error}</p>
      ) : (
        <p id={hintId} className="visit-kind-hint">A resposta será aplicada a todas as pessoas deste cadastro.</p>
      )}
    </div>
  );
}
