import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { FollowUpDetail } from '../types';
import { FOLLOW_UP_CONTACT_TYPE_LABELS, FOLLOW_UP_STATUS_LABELS } from '../utils/visitorFollowUp';
import { AppIcon } from './AppIcon';
import './FollowUpModals.css';

interface Props {
  id: string;
  onClose: () => void;
}

export function FollowUpHistoryModal({ id, onClose }: Props) {
  const [detail, setDetail] = useState<FollowUpDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getFollowUp(id)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível carregar o histórico.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="follow-up-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="card follow-up-modal"
        role="dialog"
        aria-labelledby="follow-up-history-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="follow-up-history-title">Histórico de contatos</h2>
        <p>{detail?.followUp.visitorName || 'Carregando...'}</p>
        {error && <p className="error-message" role="alert">{error}</p>}
        {loading ? (
          <p className="empty-state">Carregando histórico...</p>
        ) : detail?.contacts.length ? (
          <ol className="follow-up-history-list">
            {detail.contacts.map((contact) => (
              <li key={contact.id}>
                <strong>{FOLLOW_UP_CONTACT_TYPE_LABELS[contact.type]}</strong>
                <span>{new Date(contact.contactedAt).toLocaleString('pt-BR')}</span>
                <p>{contact.result}</p>
                {contact.note && <p>{contact.note}</p>}
                <small>
                  {FOLLOW_UP_STATUS_LABELS[contact.status]}
                  {contact.createdBy?.name ? ` • ${contact.createdBy.name}` : ''}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-state">Nenhum contato registrado ainda.</p>
        )}
        <div className="follow-up-modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            <AppIcon name="close" />
            Fechar
          </button>
        </div>
      </section>
    </div>
  );
}
