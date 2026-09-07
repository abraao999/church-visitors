import { AppIcon } from '../components/AppIcon';
import type { VehicleNoticeAlert } from '../types';
import { alertActionLabel, relativeAlertTime } from './vehicleAlertLogic';
import './VehicleAlertToasts.css';

interface Props {
  notices: VehicleNoticeAlert[];
  canAnnounce: boolean;
  busyId: string;
  liveMessage: string;
  onView: (id: string) => void;
  onAnnounce: (notice: VehicleNoticeAlert) => void;
  onDismiss: (id: string) => void;
}

export function VehicleAlertToasts({
  notices,
  canAnnounce,
  busyId,
  liveMessage,
  onView,
  onAnnounce,
  onDismiss,
}: Props) {
  return (
    <div className="vehicle-alert-stack">
      <p className="vehicle-alert-live" aria-live="polite">
        {liveMessage}
      </p>
      {notices.map((notice) => (
        <article key={notice.id} className="card vehicle-alert-toast" role="dialog" aria-label="Novo aviso de veículo">
          <div className="vehicle-alert-toast-top">
            <span className="vehicle-alert-icon" aria-hidden="true">
              <AppIcon name="car" />
            </span>
            <div className="vehicle-alert-copy">
              <small>Novo aviso de veículo</small>
              <strong className="vehicle-alert-plate">{notice.plate}</strong>
              <p>
                {notice.vehicleModel || 'Veículo'} · {alertActionLabel(notice)}
              </p>
              <p>
                {relativeAlertTime(notice.createdAt)}
                {notice.serviceId ? ' · Vinculado ao culto' : ''}
              </p>
            </div>
            <button
              type="button"
              className="vehicle-alert-dismiss"
              aria-label="Fechar aviso"
              onClick={() => onDismiss(notice.id)}
            >
              <AppIcon name="close" />
            </button>
          </div>
          <div className="vehicle-alert-actions">
            <button type="button" className="btn btn-secondary" onClick={() => onView(notice.id)}>
              Ver aviso
            </button>
            {canAnnounce && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busyId === notice.id}
                onClick={() => onAnnounce(notice)}
              >
                Marcar como anunciado
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
