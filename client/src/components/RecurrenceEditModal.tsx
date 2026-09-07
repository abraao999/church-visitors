import { AppIcon } from './AppIcon';
import type { Service } from '../types';
import { longDateLabel, serviceDateKey } from '../utils/serviceSchedule';
import './RecurrenceEditModal.css';

interface Props {
  service: Service;
  onChoose: (scope: 'this' | 'thisAndFuture') => void;
  onCancelOccurrence: () => void;
  onClose: () => void;
}

export function RecurrenceEditModal({ service, onChoose, onCancelOccurrence, onClose }: Props) {
  const dateLabel = longDateLabel(service.dateKey || serviceDateKey(service.date));

  return (
    <div className="recurrence-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card recurrence-modal"
        role="dialog"
        aria-labelledby="recurrence-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="recurrence-modal-icon"><AppIcon name="refresh" /></span>
        <h2 id="recurrence-modal-title">Alterar culto recorrente</h2>
        <p>
          Este culto faz parte de uma sequência{' '}
          {service.series?.frequency === 'biweekly' ? 'quinzenal' : 'semanal'}.
        </p>

        <div className="recurrence-modal-service">
          <AppIcon name="calendar" />
          <div>
            <strong>{service.title}</strong>
            <span>{dateLabel} · {service.time || 'sem horário'}</span>
          </div>
        </div>

        <p className="recurrence-modal-question">Quais cultos deseja alterar?</p>
        <div className="recurrence-scope-list">
          <button type="button" className="recurrence-scope" onClick={() => onChoose('this')}>
            <span className="recurrence-scope-radio" aria-hidden="true" />
            <span>
              <strong>Somente este culto</strong>
              <small>Altera apenas o culto de {dateLabel}. Os demais continuam iguais.</small>
            </span>
          </button>
          <button type="button" className="recurrence-scope" onClick={() => onChoose('thisAndFuture')}>
            <span className="recurrence-scope-radio" aria-hidden="true" />
            <span>
              <strong>Este e os próximos cultos</strong>
              <small>Aplica a mudança a partir de {dateLabel}.</small>
            </span>
          </button>
        </div>

        <button type="button" className="btn-text recurrence-cancel-link" onClick={onCancelOccurrence}>
          Quero cancelar somente esta ocorrência
        </button>

        <p className="service-preview-note">
          <AppIcon name="info" />
          Cultos anteriores e seus registros não serão alterados.
        </p>

        <div className="service-form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
