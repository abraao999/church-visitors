import { Link, useLocation } from 'react-router-dom';

export function ForbiddenPage() {
  const location = useLocation();
  const reason = (location.state as { reason?: string } | null)?.reason;
  const disabled = reason === 'follow-up-disabled';

  return (
    <div className="card" style={{ maxWidth: 520, margin: '2rem auto' }}>
      <h1>{disabled ? 'Acompanhamento desativado' : 'Sem acesso a esta área'}</h1>
      <p style={{ color: 'var(--text-muted)', margin: '0.75rem 0 1.25rem' }}>
        {disabled
          ? 'O acompanhamento de visitantes não está ativado para esta igreja. Fale com o administrador se precisar usar esta função.'
          : 'Sua função não inclui esta parte do sistema. Se precisar, fale com o responsável da igreja.'}
      </p>
      <Link to={disabled ? '/visitantes' : '/'} className="btn btn-primary">
        {disabled ? 'Ir para visitantes' : 'Voltar ao início'}
      </Link>
    </div>
  );
}
