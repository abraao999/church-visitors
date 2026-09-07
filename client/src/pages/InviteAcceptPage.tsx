import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import { ThemeToggle } from '../components/ThemeToggle';
import type { PublicInvitation } from '../types';
import './AuthPages.css';
import './InviteAcceptPage.css';

export function InviteAcceptPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<PublicInvitation | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  useEffect(() => {
    api
      .getPublicInvitation(token)
      .then((next) => {
        setInvite(next);
        setName(next.name);
        setEmail(next.email || '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Convite indisponível.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('A confirmação não coincide com a senha.');
      return;
    }
    setSaving(true);
    try {
      await api.acceptPublicInvitation(token, {
        name,
        email: email || undefined,
        username: username || undefined,
        password,
        confirmPassword,
      });
      window.location.assign('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o acesso.');
    } finally {
      setSaving(false);
    }
  }

  const invitedName = invite?.name?.trim() || '';
  const feminine = invitedName.endsWith('a') && !invitedName.endsWith('ia');

  return (
    <div className="invite-accept-page">
      <div className="invite-accept-card card">
        <div className="invite-accept-brand">
          <span className="auth-logo-icon">✝</span>
          <div>
            <strong>{invite?.churchName || 'Church Visitors'}</strong>
            <small>Convite para a equipe</small>
          </div>
          <ThemeToggle compact />
        </div>

        {loading ? (
          <p className="empty-state">Validando convite...</p>
        ) : !invite ? (
          <>
            <h1>Convite indisponível</h1>
            <p className="error-message" role="alert">
              {error}
            </p>
            <Link to="/login" className="btn btn-primary">
              Ir para o login
            </Link>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)}>
            <h1>{feminine ? 'Você foi convidada' : 'Você foi convidado'}</h1>
            <p>
              {invitedName ? `${invitedName.split(' ')[0]}, ` : ''}crie seu acesso para ajudar a equipe da igreja.
            </p>
            <div className="invite-role-box">
              <AppIcon name="panels" />
              <div>
                <small>Sua função</small>
                <strong>{invite.roleLabel}</strong>
                <span>{invite.roleSummary}</span>
                {invite.areas.length > 0 && <span>{invite.areas.join(' · ')}</span>}
              </div>
            </div>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <div className="form-group">
              <label htmlFor="invite-name">Seu nome</label>
              <input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="invite-email">E-mail</label>
              <input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required={!invite.emailLocked}
                readOnly={invite.emailLocked}
              />
            </div>
            {!invite.emailLocked && (
              <div className="form-group">
                <label htmlFor="invite-username">Nome de usuário (opcional)</label>
                <input id="invite-username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="invite-password">Crie uma senha</label>
              <input
                id="invite-password"
                type="password"
                value={password}
                minLength={8}
                required
                onChange={(e) => setPassword(e.target.value)}
              />
              <small className={password.length >= 8 ? 'ok' : ''}>Pelo menos 8 caracteres</small>
            </div>
            <div className="form-group">
              <label htmlFor="invite-confirm">Confirme sua senha</label>
              <input
                id="invite-confirm"
                type="password"
                value={confirmPassword}
                minLength={8}
                required
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Criando...' : 'Criar meu acesso'}
            </button>
            <p className="team-security">
              <AppIcon name="lock" /> Este convite funciona apenas uma vez.
            </p>
            <p>
              Já possui uma conta?{' '}
              <button type="button" className="invite-login-link" onClick={() => navigate('/login')}>
                Entrar
              </button>
            </p>
            <p className="invite-footnote">Seu acesso será vinculado somente à {invite.churchName}.</p>
          </form>
        )}
      </div>
    </div>
  );
}
