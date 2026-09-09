import { VISIT_KIND_LABELS, type VisitKind } from '../types';

interface Props {
  id: string;
  value: VisitKind;
  onChange: (value: VisitKind) => void;
  disabled?: boolean;
}

export function VisitKindField({ id, value, onChange, disabled }: Props) {
  return (
    <div className="visitor-field">
      <label htmlFor={id}>É a primeira vez que visita esta igreja?</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as VisitKind)}
      >
        <option value="unknown">{VISIT_KIND_LABELS.unknown}</option>
        <option value="first">{VISIT_KIND_LABELS.first}</option>
        <option value="returning">{VISIT_KIND_LABELS.returning}</option>
      </select>
    </div>
  );
}
