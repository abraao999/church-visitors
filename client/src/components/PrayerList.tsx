import type { PrayerRequest } from '../types';

interface Props {
  requests: PrayerRequest[];
  onDelete: (id: string) => void;
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PrayerList({ requests, onDelete }: Props) {
  if (requests.length === 0) {
    return (
      <div className="card">
        <h2>Pedidos de hoje</h2>
        <p className="empty-state">Nenhum pedido de oração registrado.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Pedidos de hoje ({requests.length})</h2>
      <ul style={{ listStyle: 'none', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {requests.map((item) => (
          <li
            key={item._id}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong>{item.isAnonymous ? 'Anônimo' : item.name}</strong>
                <span className={`badge badge-${item.source}`}>
                  {item.source === 'live' ? 'Live' : 'Portaria'}
                </span>
              </div>
              <p style={{ marginTop: '0.5rem' }}>{item.request}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.35rem' }}>
                {formatTime(item.createdAt)}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => onDelete(item._id)}
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
