import type { Visitor } from '../types';
import { RELATIONSHIP_LABELS, VISIT_KIND_LABELS } from '../types';
import { AppIcon } from './AppIcon';
import './PrivateRecords.css';

interface Props {
  visitors: Visitor[];
  onDelete: (id: string) => void;
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function originLabel(visitor: Visitor): string {
  if (visitor.source === 'guest_access') {
    return visitor.guestAccess?.name
      ? `Enviado pelo acesso ${visitor.guestAccess.name}`
      : 'Enviado pela equipe da portaria';
  }
  return visitor.createdBy?.name
    ? `Registrado por ${visitor.createdBy.name}`
    : 'Registro anterior';
}

export function VisitorList({ visitors, onDelete }: Props) {
  if (visitors.length === 0) {
    return (
      <div className="private-record-list card">
        <p className="empty-state">Nenhum visitante registrado nesta data.</p>
      </div>
    );
  }

  return (
    <div className="private-record-list card">
      <ul>
        {visitors.map((visitor) => (
          <li key={visitor._id}>
            <div className="private-record-copy">
              <div className="private-record-name-row">
                <strong>{visitor.name}</strong>
                <span className={`private-origin-badge ${visitor.source === 'guest_access' ? 'guest' : 'owner'}`}>
                  {visitor.source === 'guest_access' ? 'Portaria' : 'Responsável'}
                </span>
              </div>
              <p className="private-record-meta">
                {visitor.city || 'Cidade não informada'}
                {visitor.relationship && visitor.relationship !== 'outro'
                  ? ` · ${RELATIONSHIP_LABELS[visitor.relationship] ?? visitor.relationship}`
                  : ''}
              </p>
              <span className={`private-visit-kind ${visitor.visitKind ?? 'unknown'}`}>
                {VISIT_KIND_LABELS[visitor.visitKind ?? 'unknown']}
              </span>
              <p className="private-record-origin">
                <AppIcon name="clock" /> {formatTime(visitor.createdAt)} · {originLabel(visitor)}
              </p>
            </div>
            <button
              type="button"
              className="private-record-remove"
              onClick={() => onDelete(visitor._id)}
            >
              <AppIcon name="trash" /> Remover visitante
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
