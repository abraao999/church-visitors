import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../utils/permissions';
import { AppIcon } from './AppIcon';
import './RetentionPolicySection.css';

export function VisitorFollowUpSettings() {
  const { user, refreshUser } = useAuth();
  const canUpdate = hasPermission(user?.permissions, 'church:update') || user?.role === 'owner';
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api
      .getChurch()
      .then((church) => setEnabled(church.visitorFollowUpEnabled === true))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar esta configuração.');
      })
      .finally(() => setLoading(false));
  }, []);

  async function save(next: boolean) {
    if (!canUpdate) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const saved = await api.updateChurchVisitorFollowUp(next);
      setEnabled(saved.visitorFollowUpEnabled === true);
      await refreshUser();
      setSuccess(next ? 'Acompanhamento de visitantes ativado.' : 'Acompanhamento de visitantes desativado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar esta configuração.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="empty-state">Carregando acompanhamento...</p>;
  }

  return (
    <section className="card church-settings-form retention-section" style={{ marginTop: '1.25rem' }}>
      <div className="church-settings-form-heading">
        <span>
          <AppIcon name="heartHand" />
        </span>
        <div>
          <h2>Acompanhamento de visitantes</h2>
          <p>Permite organizar contatos e acompanhar visitantes depois do culto.</p>
        </div>
      </div>

      <div className="church-settings-feedback" aria-live="polite">
        {error && <p className="error-message" role="alert">{error}</p>}
        {success && (
          <p className="success-message">
            <AppIcon name="check" />
            {success}
          </p>
        )}
      </div>

      <label className="retention-toggle">
        <span>
          <strong>Acompanhamento de visitantes</strong>
          <small>Permite organizar contatos e acompanhar visitantes depois do culto.</small>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canUpdate || saving}
          onChange={(event) => void save(event.target.checked)}
        />
      </label>
    </section>
  );
}
