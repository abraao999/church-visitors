import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return (
    <div className="card" style={{ maxWidth: 520, margin: '2rem auto' }}>
      <h1>Sem acesso a esta área</h1>
      <p style={{ color: 'var(--text-muted)', margin: '0.75rem 0 1.25rem' }}>
        Sua função não inclui esta parte do sistema. Se precisar, fale com o responsável da igreja.
      </p>
      <Link to="/" className="btn btn-primary">
        Voltar ao início
      </Link>
    </div>
  );
}
