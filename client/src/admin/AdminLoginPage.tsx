import { useId, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AppIcon } from '../components/AppIcon';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAdminAuth } from './AdminAuthContext';
import './AdminLayout.css';

export function AdminLoginPage() {
  const { admin, loading, login } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const errorId = useId();
  const from = (location.state as { from?: string } | null)?.from || '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && admin) {
    return <Navigate to={from.startsWith('/admin') ? from : '/admin'} replace />;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from.startsWith('/admin') ? from : '/admin', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-login">
      <section className="admin-login-copy">
        <div className="admin-brand">
          <span className="admin-brand-mark" aria-hidden="true">✝</span>
          <div>
            <strong>Eclesiafy</strong>
            <span>Administração da plataforma</span>
          </div>
        </div>
        <div style={{ marginTop: '2.2rem' }}>
          <span className="admin-badge">Acesso exclusivo</span>
          <h1 style={{ margin: '0.8rem 0 0.4rem' }}>Painel administrativo</h1>
          <p>Gerencie igrejas e a operação da plataforma em um ambiente separado.</p>
        </div>
        <div className="admin-login-points">
          <div className="admin-login-point">
            <AppIcon name="shield" />
            <span>Sessão independente dos usuários das igrejas</span>
          </div>
          <div className="admin-login-point">
            <AppIcon name="pin" />
            <span>Visão consolidada sem expor visitantes ou orações</span>
          </div>
          <div className="admin-login-point">
            <AppIcon name="clipboard" />
            <span>Todas as ações administrativas registradas</span>
          </div>
        </div>
      </section>
      <section className="admin-login-form-wrap">
        <form className="card admin-login-form" onSubmit={handleSubmit}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="admin-badge">Eclesiafy Admin</span>
            <ThemeToggle compact />
          </div>
          <h2 style={{ margin: '0.85rem 0 0.3rem' }}>Entrar</h2>
          <p>Use sua conta administrativa. Não há cadastro público.</p>
          {error && (
            <p id={errorId} className="error-message admin-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-group">
            <label htmlFor="admin-email">E-mail</label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
          <div className="form-group">
            <label htmlFor="admin-password">Senha</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Entrando...' : 'Entrar no painel'}
          </button>
          <p className="admin-page-heading" style={{ marginTop: '0.9rem' }}>
            <span style={{ fontSize: '0.86rem' }}>
              Problemas para entrar? Fale com o administrador principal.
            </span>
          </p>
        </form>
      </section>
    </div>
  );
}
