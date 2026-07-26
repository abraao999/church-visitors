import { useState } from 'react';
import { api } from '../api/client';

interface Props {
  source: 'porteiro' | 'live';
  onSuccess?: () => void;
  compact?: boolean;
}

export function PrayerForm({ source, onSuccess, compact = false }: Props) {
  const [name, setName] = useState('');
  const [request, setRequest] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
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
        source,
        isAnonymous,
      });
      setName('');
      setRequest('');
      setIsAnonymous(false);
      setSuccess(
        source === 'live'
          ? 'Seu pedido foi enviado. Oremos juntos!'
          : 'Pedido de oração registrado.'
      );
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={compact ? '' : 'card'}>
      {!compact && (
        <>
          <h2>Registrar pedido de oração</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
            Registre pedidos feitos presencialmente ou pela portaria.
          </p>
        </>
      )}

      {error && <p className="error-message">{error}</p>}
      {success && <p className="success-message">{success}</p>}

      <div className="form-group">
        <label>
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            style={{ marginRight: '0.5rem' }}
          />
          Pedido anônimo
        </label>
      </div>

      {!isAnonymous && (
        <div className="form-group">
          <label htmlFor="prayerName">Nome</label>
          <input
            id="prayerName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
            required={!isAnonymous}
          />
        </div>
      )}

      <div className="form-group">
        <label htmlFor="prayerRequest">Pedido de oração</label>
        <textarea
          id="prayerRequest"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="Descreva o pedido de oração..."
          required
        />
      </div>

      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? 'Enviando...' : source === 'live' ? 'Enviar pedido' : 'Registrar pedido'}
      </button>
    </form>
  );
}
