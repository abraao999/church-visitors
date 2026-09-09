import type { PrayerCareStatus, PrayerRequest } from '../types';
import { PRAYER_CARE_LABELS, PRAYER_CARE_STATUSES } from '../types';
import { AppIcon } from './AppIcon';
import './PrivateRecords.css';

interface Props {
  requests: PrayerRequest[];
  onDelete: (id: string) => void;
  onCareChange?: (id: string, status: PrayerCareStatus) => void;
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function originLabel(item: PrayerRequest): string {
  if (item.source === 'guest_access') {
    return item.guestAccess?.name
      ? `Enviado pelo acesso ${item.guestAccess.name}`
      : 'Enviado pelo acesso de oração';
  }
  if (item.createdBy?.name) return `Registrado por ${item.createdBy.name}`;
  if (item.source === 'live') return 'Enviado pelo link público antigo';
  return 'Registro anterior da portaria';
}

export function PrayerList({ requests, onDelete, onCareChange }: Props) {
  if (requests.length === 0) {
    return (
      <div className="private-record-list card">
        <p className="empty-state">Nenhum pedido de oração nesta data.</p>
      </div>
    );
  }

  return (
    <div className="private-record-list card">
      <ul>
        {requests.map((item) => (
          <li key={item._id}>
            <div className="private-record-copy">
              <div className="private-record-name-row">
                <strong>{item.isAnonymous ? 'Anônimo' : item.name}</strong>
                <span className={`private-origin-badge ${item.source === 'guest_access' ? 'guest' : 'owner'}`}>
                  {item.source === 'guest_access' ? 'Acesso de oração' : 'Responsável'}
                </span>
              </div>
              <p className="private-record-body">{item.request}</p>
              <p className="private-record-origin">
                <AppIcon name="clock" /> {formatTime(item.createdAt)} · {originLabel(item)} ·{' '}
                {item.allowProjection ? 'Autorizado para o telão' : 'Não vai ao telão'}
              </p>
              {onCareChange && (
                <label className="private-record-care">
                  <span>Acompanhamento</span>
                  <select
                    value={item.careStatus || 'new'}
                    onChange={(event) => onCareChange(item._id, event.target.value as PrayerCareStatus)}
                  >
                    {PRAYER_CARE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {PRAYER_CARE_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <button
              type="button"
              className="private-record-remove"
              onClick={() => onDelete(item._id)}
            >
              <AppIcon name="trash" /> Remover pedido
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
