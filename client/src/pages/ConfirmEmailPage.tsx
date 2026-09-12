import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { confirmStateFromCode, readErrorCode } from '../auth/authScreenState';
import { useAuth } from '../auth/AuthContext';
import { stripHashFromLocation } from '../auth/emailTokenFragment';
import { clearPendingChallengeId, readPendingChallengeId } from '../auth/pendingChallenge';
import { AuthLayout } from '../components/AuthLayout';
import type { ConfirmEmailScreenState } from '../types';
import './AuthPages.css';

const COPY: Record<ConfirmEmailScreenState, { title: string; text: string }> = {
  verifying: {
    title: 'Confirmando seu e-mail',
    text: 'Aguarde alguns instantes.',
  },
  confirmed: {
    title: 'E-mail confirmado',
    text: 'Sua igreja e o primeiro acesso já estão prontos.',
  },
  invalid: {
    title: 'Link inválido',
    text: 'Este link não é válido. Peça um novo e-mail ou volte ao cadastro.',
  },
  expired: {
    title: 'Link expirado',
    text: 'Este link expirou. Volte ao cadastro ou peça um novo envio.',
  },
  used: {
    title: 'Link já utilizado',
    text: 'Este link já foi usado. Se a conta já existe, entre com seu e-mail e senha.',
  },
  temporary: {
    title: 'Falha temporária',
    text: 'Não foi possível confirmar agora. Tente novamente em instantes.',
  },
  missing: {
    title: 'Link incompleto',
    text: 'Abra o link enviado no e-mail para confirmar o cadastro.',
  },
  needsPassword: {
    title: 'E-mail confirmado',
    text: 'Enviamos um segundo e-mail para você criar a própria senha. Olhe também o spam.',
  },
};

export function ConfirmEmailPage() {
  const { confirmEmail, user } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<ConfirmEmailScreenState>('verifying');
  const challengeId = readPendingChallengeId();

  useEffect(() => {
    const token = stripHashFromLocation(window.history, window.location);
    if (!token) {
      setState(user ? 'confirmed' : 'missing');
      return;
    }

    let cancelled = false;
    confirmEmail({ token })
      .then((result) => {
        if (cancelled) return;
        clearPendingChallengeId();
        setState(result.needsPassword ? 'needsPassword' : 'confirmed');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError) {
          setState(confirmStateFromCode(readErrorCode(error)));
          return;
        }
        setState('temporary');
      });

    return () => {
      cancelled = true;
    };
  }, [confirmEmail, user]);

  const copy = COPY[state];

  return (
    <AuthLayout title={copy.title} subtitle={copy.text}>
      <div className="auth-result" aria-live="polite">
        {state === 'verifying' && <p className="auth-status">Verificando o link...</p>}
        {state === 'confirmed' && (
          <button
            type="button"
            className="btn btn-primary auth-submit"
            onClick={() => navigate('/', { replace: true })}
          >
            Entrar na Eclesiafy
          </button>
        )}
        {(state === 'expired' || state === 'invalid' || state === 'missing') && (
          <div className="auth-result-actions">
            <Link className="btn btn-primary auth-submit" to="/login">
              Voltar ao cadastro
            </Link>
            {challengeId && state === 'expired' && (
              <Link className="auth-text-link" to="/login">
                Solicitar um novo envio
              </Link>
            )}
          </div>
        )}
        {state === 'needsPassword' && (
          <Link className="btn btn-primary auth-submit" to="/esqueci-senha">
            Abrir recuperação de senha
          </Link>
        )}
        {state === 'used' && (
          <Link className="btn btn-primary auth-submit" to="/login">
            Entrar na conta
          </Link>
        )}
        {state === 'temporary' && (
          <button
            type="button"
            className="btn btn-primary auth-submit"
            onClick={() => window.location.reload()}
          >
            Tentar de novo
          </button>
        )}
      </div>
    </AuthLayout>
  );
}
