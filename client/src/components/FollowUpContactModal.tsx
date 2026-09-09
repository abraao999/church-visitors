import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { FollowUpContactType, FollowUpListItem, FollowUpStatus } from '../types';
import { hasPermission } from '../utils/permissions';
import { FOLLOW_UP_CONTACT_TYPE_LABELS, FOLLOW_UP_STATUS_LABELS, localDateTimeValue } from '../utils/visitorFollowUp';
import './FollowUpModals.css';

interface Props {
  item: FollowUpListItem;
  onClose: () => void;
  onSaved: () => void;
}

export function FollowUpContactModal({ item, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const canClose = hasPermission(user?.permissions, 'follow_up:close') || user?.role === 'owner';
  const [contactedAt, setContactedAt] = useState(localDateTimeValue());
  const [type, setType] = useState<FollowUpContactType>('whatsapp');
  const [result, setResult] = useState('');
  const [note, setNote] = useState('');
  const [nextContactAt, setNextContactAt] = useState('');
  const [status, setStatus] = useState<FollowUpStatus>('contacted');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createFollowUpContact(item.id, {
        contactedAt: new Date(contactedAt).toISOString(),
        type,
        result,
        note: note.trim() || undefined,
        nextContactAt: nextContactAt || undefined,
        status,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar o contato.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="follow-up-modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="card follow-up-modal"
        role="dialog"
        aria-labelledby="follow-up-contact-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="follow-up-contact-title">Registrar contato</h2>
        <p>{item.visitorName}</p>
        {error && <p className="error-message" role="alert">{error}</p>}
        <label className="visitor-field">
          Data e horário
          <input type="datetime-local" value={contactedAt} onChange={(event) => setContactedAt(event.target.value)} required />
        </label>
        <label className="visitor-field">
          Tipo de contato
          <select value={type} onChange={(event) => setType(event.target.value as FollowUpContactType)}>
            {(Object.keys(FOLLOW_UP_CONTACT_TYPE_LABELS) as FollowUpContactType[]).map((key) => (
              <option key={key} value={key}>{FOLLOW_UP_CONTACT_TYPE_LABELS[key]}</option>
            ))}
          </select>
        </label>
        <label className="visitor-field">
          Resultado
          <input value={result} onChange={(event) => setResult(event.target.value)} placeholder="Ex.: Conversou com a família" required maxLength={200} />
        </label>
        <label className="visitor-field">
          Observação
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={500} />
        </label>
        <label className="visitor-field">
          Próximo contato
          <input type="date" value={nextContactAt} onChange={(event) => setNextContactAt(event.target.value)} />
        </label>
        <label className="visitor-field">
          Situação do acompanhamento
          <select value={status} onChange={(event) => setStatus(event.target.value as FollowUpStatus)}>
            {(Object.keys(FOLLOW_UP_STATUS_LABELS) as FollowUpStatus[])
              .filter((key) => canClose || key !== 'closed')
              .map((key) => (
                <option key={key} value={key}>{FOLLOW_UP_STATUS_LABELS[key]}</option>
              ))}
          </select>
        </label>
        <div className="follow-up-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar contato'}
          </button>
        </div>
      </form>
    </div>
  );
}
