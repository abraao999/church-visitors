import { useState } from 'react';
import { api } from '../api/client';
import { AppIcon } from './AppIcon';
import './PrayerForm.css';

interface Props {
  onSuccess?: () => void;
  compact?: boolean;
}

export function PrayerForm({ onSuccess, compact = false }: Props) {
  const [name, setName] = useState('');
  const [request, setRequest] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [allowProjection, setAllowProjection] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await api.createPrayerRequest({
        name: isAnonymous ? '' : name,
        request,
        isAnonymous,
        allowProjection,
      });
      setName('');
      setRequest('');
      setIsAnonymous(false);
      setAllowProjection(false);
      setSuccess('Pedido de oração registrado.');
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`prayer-form${compact ? ' prayer-form-compact' : ' card'}`}>
      {!compact && (
        <div className="prayer-form-heading">
          <span className="prayer-form-icon"><AppIcon name="prayer" /></span>
          <div>
            <h2>Registrar pedido</h2>
            <p>Preencha as informações compartilhadas pela pessoa.</p>
          </div>
        </div>
      )}

      <div className="prayer-feedback" aria-live="polite">
        {error && (
          <p id="prayer-form-error" className="error-message" role="alert">
            {error}
          </p>
        )}
        {success && <p className="success-message"><AppIcon name="check" />{success}</p>}
      </div>

      <div className="anonymous-option">
        <label className="anonymous-switch">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
          />
          <span className="anonymous-switch-control" aria-hidden="true" />
          <span>
            <strong>Manter nome em sigilo</strong>
            <small>O pedido aparecerá como “Anônimo”.</small>
          </span>
        </label>
      </div>

      <div className="anonymous-option">
        <label className="anonymous-switch">
          <input
            type="checkbox"
            checked={allowProjection}
            onChange={(e) => setAllowProjection(e.target.checked)}
          />
          <span className="anonymous-switch-control" aria-hidden="true" />
          <span>
            <strong>A pessoa autorizou exibir no telão</strong>
            <small>Sem isso o pedido não aparece no painel de TV.</small>
          </span>
        </label>
      </div>

      {!isAnonymous && (
        <div className="form-group prayer-field">
          <label htmlFor="prayerName">Nome</label>
          <input
            id="prayerName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Digite o nome da pessoa"
            required={!isAnonymous}
            autoComplete="name"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'prayer-form-error' : undefined}
          />
        </div>
      )}

      <div className="form-group prayer-field">
        <div className="prayer-field-label">
          <label htmlFor="prayerRequest">Pedido de oração</label>
          <span>{request.length} caracteres</span>
        </div>
        <textarea
          id="prayerRequest"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="Escreva aqui o pedido de oração"
          required
          rows={5}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'prayer-form-error' : undefined}
        />
      </div>

      <button type="submit" className="btn btn-primary prayer-submit" disabled={loading}>
        {!loading && <AppIcon name="check" />}
        {loading ? 'Enviando...' : 'Registrar pedido'}
      </button>

      <p className="prayer-privacy-note">
        <AppIcon name="lock" />
        Revise as informações antes de registrar.
      </p>
    </form>
  );
}
