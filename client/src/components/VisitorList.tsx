import type { Visitor } from '../types';
import { formatMember } from '../types';

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

export function VisitorList({ visitors, onDelete }: Props) {
  if (visitors.length === 0) {
    return (
      <div className="card">
        <h2>Visitantes de hoje</h2>
        <p className="empty-state">Nenhum visitante registrado ainda.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Visitantes de hoje ({visitors.length})</h2>
      <ul style={{ listStyle: 'none', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {visitors.map((visitor) => (
          <li
            key={visitor._id}
            style={{
              padding: '1rem',
              background: 'var(--surface-muted)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '1rem',
            }}
          >
            <div>
              <strong>{visitor.familyName}</strong>
              <ul style={{ listStyle: 'none', marginTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                {visitor.members.map((member, index) => (
                  <li key={index} style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    {formatMember(member)}
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: '0.875rem', marginTop: '0.35rem' }}>
                📍 {visitor.origin}
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.35rem' }}>
                {formatTime(visitor.createdAt)}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => onDelete(visitor._id)}
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
