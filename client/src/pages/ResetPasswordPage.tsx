import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { resetStateFromStatus } from '../auth/authScreenState';
import { stripHashFromLocation } from '../auth/emailTokenFragment';
import { AuthLayout } from '../components/AuthLayout';
import type { ResetPasswordScreenState } from '../types';
import './AuthPages.css';

const COPY: Record<ResetPasswordScreenState, { title: string; text: string }> = {
  validating: {
    title: 'Validando o link',
    text: 'Aguarde alguns instantes.',
  },
  form: {
    title: 'Criar uma nova senha',
    text: 'Escolha uma senha com pelo menos oito caracteres.',
  },
  invalid: {
    title: 'Link inválido',
    text: 'Este link não é válido. Solicite uma nova recuperação.',
  },
  expired: {
    title: 'Link expirado',
    text: 'Este link expirou. Solicite uma nova recuperação.',
  },
  used: {
    title: 'Link já utilizado',
    text: 'Este link já foi usado. Solicite uma nova recuperação se ainda precisar.',
  },
  saving: {
    title: 'Salvando a nova senha',
    text: 'Aguarde alguns instantes.',
  },
  changed: {
    title: 'Senha alterada',
    text: 'Entre com a nova senha para continuar.',
  },
  missing: {
    title: 'Link incompleto',
    text: 'Abra o link enviado no e-mail para criar uma nova senha.',
  },
};

export function ResetPasswordPage() {
  const errorId = useId();
  const hintId = useId();
  const [token, setToken] = useState('');
  const [state, setState] = useState<ResetPasswordScreenState>('validating');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const found = stripHashFromLocation(window.history, window.location);
    if (!found) {
      setState('missing');
      return;
    }
    setToken(found);
    let cancelled = false;
    api
      .inspectPasswordReset(found)
      .then((result) => {
        if (!cancelled) setState(resetStateFromStatus(result.status));
      })
      .catch(() => {
        if (!cancelled) setState('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('A senha deve ter ao menos 8 caracteres');
      document.getElementById('new-password')?.focus();
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação não coincide com a nova senha.');
      document.getElementById('confirm-password')?.focus();
      return;
    }
    setState('saving');
    try {
      await api.resetPassword({ token, newPassword, confirmPassword });
      setState('changed');
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'expired' || err.code === 'used' || err.code === 'invalid')) {
        setState(resetStateFromStatus(err.code));
        return;
      }
      setState('form');
      setError(err instanceof Error ? err.message : 'Não foi possível redefinir a senha.');
    }
  }

  const copy = COPY[state];

  return (
    <AuthLayout title={copy.title} subtitle={copy.text}>
      <div aria-live="polite">
        {state === 'validating' && <p className="auth-status">Validando o link...</p>}
        {state === 'saving' && <p className="auth-status">Salvando a nova senha...</p>}
        {(state === 'invalid' || state === 'expired' || state === 'used' || state === 'missing') && (
          <Link className="btn btn-primary auth-submit" to="/esqueci-senha">
            Solicitar nova recuperação
          </Link>
        )}
        {state === 'changed' && (
          <Link className="btn btn-primary auth-submit" to="/login">
            Entrar com a nova senha
          </Link>
        )}
      </div>

      {(state === 'form' || state === 'saving') && (
        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <p id={errorId} className="error-message auth-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-group auth-field">
            <label htmlFor="new-password">Nova senha</label>
            <div className="auth-password-wrap">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                disabled={state === 'saving'}
                aria-invalid={Boolean(error)}
                aria-describedby={`${hintId}${error ? ` ${errorId}` : ''}`}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-pressed={showPassword}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            <small id={hintId}>Use pelo menos 8 caracteres.</small>
          </div>
          <div className="form-group auth-field">
            <label htmlFor="confirm-password">Confirmar nova senha</label>
            <input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              disabled={state === 'saving'}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
          <button type="submit" className="btn btn-primary auth-submit" disabled={state === 'saving'}>
            {state === 'saving' ? 'Salvando...' : 'Redefinir senha'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
