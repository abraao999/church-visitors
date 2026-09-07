import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AppIcon } from '../components/AppIcon';
import './ChurchSettingsPage.css';

export function ChurchSettingsPage() {
  const { setChurchName } = useAuth();
  const [form, setForm] = useState({
    name: '',
    city: '',
    phone: '',
    address: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  useEffect(() => {
    api
      .getChurch()
      .then((church) => {
        setForm({
          name: church.name || '',
          city: church.city || '',
          phone: church.phone || '',
          address: church.address || '',
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erro ao carregar dados da igreja');
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const saved = await api.updateChurch(form);
      setForm({
        name: saved.name,
        city: saved.city,
        phone: saved.phone,
        address: saved.address,
      });
      setChurchName(saved.name);
      document.title = saved.name;
      setSuccess('Dados da igreja salvos');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('A confirmação não coincide com a nova senha.');
      return;
    }

    setPasswordSaving(true);
    try {
      await api.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordSuccess('Senha alterada. As outras sessões foram encerradas.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Erro ao alterar a senha');
    } finally {
      setPasswordSaving(false);
    }
  }

  if (loading) {
    return <p className="empty-state">Carregando...</p>;
  }

  return (
    <div className="church-settings-page">
      <section className="church-settings-hero">
        <div>
          <span className="church-settings-eyebrow">
            <AppIcon name="home" /> Identidade da igreja
          </span>
          <h1>Dados da igreja</h1>
          <p>
            O nome cadastrado aparece no menu, nos painéis e nos acessos públicos dos convidados.
          </p>
        </div>
      </section>

      <form className="card church-settings-form" onSubmit={handleSave}>
        <div className="church-settings-form-heading">
          <span>
            <AppIcon name="edit" />
          </span>
          <div>
            <h2>Informações básicas</h2>
            <p>Altere o nome e os dados de contato da sua igreja.</p>
          </div>
        </div>

        <div className="church-settings-feedback" aria-live="polite">
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="success-message">
              <AppIcon name="check" />
              {success}
            </p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="church-name">Nome da igreja</label>
          <input
            id="church-name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Ex.: Igreja Batista Central"
            required
            maxLength={120}
            autoComplete="organization"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="church-city">Cidade</label>
            <input
              id="church-city"
              value={form.city}
              onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
              placeholder="Cidade"
              maxLength={100}
              autoComplete="address-level2"
            />
          </div>
          <div className="form-group">
            <label htmlFor="church-phone">Telefone</label>
            <input
              id="church-phone"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="(00) 00000-0000"
              maxLength={40}
              autoComplete="tel"
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="church-address">Endereço</label>
          <input
            id="church-address"
            value={form.address}
            onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
            placeholder="Rua, número, bairro"
            maxLength={200}
            autoComplete="street-address"
          />
        </div>

        <div className="church-settings-actions">
          <button type="submit" className="btn btn-primary" disabled={saving || !form.name.trim()}>
            {saving ? 'Salvando...' : 'Salvar dados'}
          </button>
        </div>
      </form>

      <form className="card church-settings-form" onSubmit={handlePassword}>
        <div className="church-settings-form-heading">
          <span>
            <AppIcon name="lock" />
          </span>
          <div>
            <h2>Senha da conta</h2>
            <p>A nova senha precisa ter pelo menos 8 caracteres. As outras sessões saem na hora.</p>
          </div>
        </div>

        <div className="church-settings-feedback" aria-live="polite">
          {passwordError && (
            <p className="error-message" role="alert">
              {passwordError}
            </p>
          )}
          {passwordSuccess && (
            <p className="success-message">
              <AppIcon name="check" />
              {passwordSuccess}
            </p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="current-password">Senha atual</label>
          <input
            id="current-password"
            type="password"
            value={passwordForm.currentPassword}
            onChange={(e) =>
              setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))
            }
            required
            autoComplete="current-password"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="new-password">Nova senha</label>
            <input
              id="new-password"
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) =>
                setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
              }
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirm-password">Confirmar nova senha</label>
            <input
              id="confirm-password"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
              }
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="church-settings-actions">
          <button type="submit" className="btn btn-primary" disabled={passwordSaving}>
            {passwordSaving ? 'Salvando...' : 'Alterar senha'}
          </button>
        </div>
      </form>
    </div>
  );
}
