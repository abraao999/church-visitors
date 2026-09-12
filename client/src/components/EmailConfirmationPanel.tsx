import { useEffect, useId, useState } from 'react';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { clearPendingChallengeId, resendSecondsLeft } from '../auth/pendingChallenge';
import { AppIcon } from './AppIcon';
import { EmailSpamNote } from './EmailSpamNote';

export function EmailConfirmationPanel({
  challengeId,
  emailMasked,
  resendAvailableAt,
  onBack,
  onConfirmed,
}: {
  challengeId: string;
  emailMasked?: string;
  resendAvailableAt?: string;
  onBack: () => void;
  onConfirmed: () => void;
}) {
  const { confirmEmail } = useAuth();
  const errorId = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [nextResendAt, setNextResendAt] = useState(resendAvailableAt);
  const [seconds, setSeconds] = useState(() => resendSecondsLeft(resendAvailableAt));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds(resendSecondsLeft(nextResendAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [nextResendAt]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setStatus('');
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) {
      setError('Informe o código de seis dígitos.');
      return;
    }
    setSubmitting(true);
    try {
      await confirmEmail({ challengeId, code: digits });
      clearPendingChallengeId();
      setStatus('E-mail confirmado.');
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível confirmar o código.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (seconds > 0 || resending) return;
    setError('');
    setStatus('Enviando um novo e-mail...');
    setResending(true);
    try {
      const result = await api.resendEmail(challengeId);
      setNextResendAt(result.resendAvailableAt);
      setSeconds(resendSecondsLeft(result.resendAvailableAt));
      setStatus('Enviamos um novo e-mail.');
    } catch (err) {
      if (err instanceof ApiError && err.resendAvailableAt) {
        setNextResendAt(err.resendAvailableAt);
        setSeconds(resendSecondsLeft(err.resendAvailableAt));
      }
      setStatus('');
      setError(err instanceof Error ? err.message : 'Não foi possível reenviar o e-mail.');
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="auth-confirm">
      <div className="auth-confirm-icon" aria-hidden="true">
        <AppIcon name="mail" />
      </div>
      <h2>Confirme seu e-mail</h2>
      <p>
        Enviamos uma mensagem para{' '}
        <strong>{emailMasked || 'o e-mail informado'}</strong>.
        Use o código de seis dígitos ou o botão do e-mail para confirmar.
      </p>
      <EmailSpamNote />

      {error && (
        <p id={errorId} className="error-message auth-error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="auth-status" role="status" aria-live="polite">
          {status}
        </p>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group auth-field">
          <label htmlFor="email-code">Código de seis dígitos</label>
          <input
            id="email-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            required
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
          />
        </div>
        <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
          {submitting ? 'Confirmando...' : 'Confirmar código'}
        </button>
      </form>

      <p className="auth-resend-note" aria-live="polite">
        {seconds > 0
          ? `Você poderá reenviar em ${seconds}s.`
          : 'Não chegou? Peça um novo e-mail.'}
      </p>
      <button
        type="button"
        className="btn auth-secondary"
        onClick={handleResend}
        disabled={seconds > 0 || resending}
      >
        {resending ? 'Reenviando...' : 'Reenviar e-mail'}
      </button>
      <button type="button" className="auth-text-link" onClick={onBack}>
        Voltar e corrigir o e-mail
      </button>
    </div>
  );
}
