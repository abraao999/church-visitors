import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { AuthLayout } from '../components/AuthLayout';
import './AuthPages.css';

export function ForgotPasswordPage() {
  const errorId = useId();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const result = await api.forgotPassword(email);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar as instruções.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Recuperar acesso"
      subtitle="Informe o e-mail da sua conta. Se ele estiver cadastrado, enviaremos as instruções."
    >
      {error && (
        <p id={errorId} className="error-message auth-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="auth-status" role="status" aria-live="polite">
          {message}
        </p>
      )}
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group auth-field">
          <label htmlFor="forgot-email">E-mail</label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="seu@email.com"
            required
            autoComplete="email"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
          />
        </div>
        <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
          {submitting ? 'Enviando...' : 'Enviar link de recuperação'}
        </button>
      </form>
      <Link className="auth-text-link" to="/login">
        Voltar para entrar
      </Link>
    </AuthLayout>
  );
}
