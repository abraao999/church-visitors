import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  clearPendingChallengeId,
  maskEmail,
  readPendingChallengeId,
  savePendingChallengeId,
} from '../auth/pendingChallenge';
import { AppIcon } from '../components/AppIcon';
import { EmailConfirmationPanel } from '../components/EmailConfirmationPanel';
import { ThemeToggle } from '../components/ThemeToggle';
import './AuthPages.css';

type Mode = 'login' | 'register';

export function LoginPage() {
  const { user, loading, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';

  const [mode, setMode] = useState<Mode>('login');
  const [churchName, setChurchName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<{
    challengeId: string;
    emailMasked?: string;
    resendAvailableAt?: string;
  } | null>(null);

  useEffect(() => {
    const stored = readPendingChallengeId();
    if (stored) {
      setPending({ challengeId: stored });
    }
  }, []);

  if (!loading && user) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await login(loginValue, password);
        navigate(from, { replace: true });
        return;
      }
      const result = await register({ churchName, name, email, username, password });
      savePendingChallengeId(result.challengeId);
      setPending({
        challengeId: result.challengeId,
        emailMasked: result.emailMasked || maskEmail(email),
        resendAvailableAt: result.resendAvailableAt,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na autenticação');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <aside className="auth-welcome">
          <div className="auth-welcome-brand">
            <span className="auth-logo-icon">✝</span>
            <span>Church Visitors</span>
            <ThemeToggle compact />
          </div>
          <div className="auth-welcome-copy">
            <span className="auth-eyebrow">Organização com propósito</span>
            <h1>Mais cuidado para receber e servir pessoas.</h1>
            <p>Visitantes, pedidos de oração e cultos organizados em um só lugar.</p>
          </div>
          <ul className="auth-feature-list">
            <li><AppIcon name="users" /><span><strong>Receba visitantes</strong><small>Cadastre com rapidez na portaria</small></span></li>
            <li><AppIcon name="prayer" /><span><strong>Acolha pedidos</strong><small>Centralize os pedidos de oração</small></span></li>
            <li><AppIcon name="calendar" /><span><strong>Organize os cultos</strong><small>Planeje datas e louvores</small></span></li>
          </ul>
        </aside>

        <section className="auth-card card">
          <div className="auth-mobile-brand">
            <span className="auth-logo-icon">✝</span>
            <strong>Church Visitors</strong>
            <ThemeToggle compact />
          </div>

          {pending ? (
            <EmailConfirmationPanel
              challengeId={pending.challengeId}
              emailMasked={pending.emailMasked}
              resendAvailableAt={pending.resendAvailableAt}
              onBack={() => {
                clearPendingChallengeId();
                setPending(null);
                setMode('register');
              }}
              onConfirmed={() => navigate(from, { replace: true })}
            />
          ) : (
            <>
          <div className="auth-card-heading">
            <span className="auth-card-eyebrow">Área da equipe</span>
            <h2>{mode === 'login' ? 'Que bom ter você de volta' : 'Crie sua conta'}</h2>
            <p>
              {mode === 'login'
                ? 'Entre com seus dados para continuar.'
                : 'Cadastre sua igreja e o primeiro responsável pelo sistema.'}
            </p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Acesso à conta">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'active' : ''}
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'active' : ''}
              onClick={() => {
                setMode('register');
                setError('');
              }}
            >
              Criar conta
            </button>
          </div>

          {error && (
            <p id="auth-form-error" className="error-message auth-error" role="alert">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'register' && (
              <>
                <div className="form-group auth-field">
                  <label htmlFor="churchName">Nome da igreja</label>
                  <input
                    id="churchName"
                    value={churchName}
                    onChange={(e) => setChurchName(e.target.value)}
                    placeholder="Ex.: Igreja da Comunidade"
                    required
                    maxLength={120}
                    autoComplete="organization"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'auth-form-error' : undefined}
                  />
                </div>
                <div className="form-group auth-field">
                  <label htmlFor="name">Nome do responsável</label>
                  <input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Digite seu nome"
                    required
                    autoComplete="name"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'auth-form-error' : undefined}
                  />
                </div>
                <div className="form-group auth-field">
                  <label htmlFor="email">E-mail</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    autoComplete="email"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'auth-form-error' : undefined}
                  />
                </div>
                <div className="form-group auth-field">
                  <label htmlFor="username">Nome de usuário</label>
                  <input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Escolha um usuário"
                    required
                    autoComplete="username"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'auth-form-error' : undefined}
                  />
                </div>
              </>
            )}

            {mode === 'login' && (
              <div className="form-group auth-field">
                <label htmlFor="login">Usuário ou e-mail</label>
                <input
                  id="login"
                  value={loginValue}
                  onChange={(e) => setLoginValue(e.target.value)}
                  placeholder="Digite seu usuário ou e-mail"
                  required
                  autoComplete="username"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'auth-form-error' : undefined}
                />
              </div>
            )}

            <div className="form-group auth-field">
              <label htmlFor="password">Senha</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
                required
                minLength={mode === 'register' ? 8 : 6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                aria-invalid={Boolean(error)}
                aria-describedby={
                  [
                    error ? 'auth-form-error' : '',
                    mode === 'register' ? 'auth-password-hint' : '',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
              />
              {mode === 'register' && (
                <small id="auth-password-hint">Use pelo menos 8 caracteres.</small>
              )}
            </div>

            {mode === 'login' && (
              <Link className="auth-forgot" to="/esqueci-senha">
                Esqueceu sua senha?
              </Link>
            )}

            <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
              {submitting ? 'Aguarde...' : mode === 'login' ? 'Entrar no sistema' : 'Criar minha conta'}
              {!submitting && <AppIcon name="arrow" />}
            </button>
          </form>

          <p className="auth-live-note">
            <AppIcon name="prayer" />
            Para enviar um pedido, use o link seguro fornecido pela sua igreja.
          </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
