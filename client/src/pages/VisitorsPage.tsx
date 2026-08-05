import { Link } from 'react-router-dom';
import { VisitorForm } from '../components/VisitorForm';

export function VisitorsPage() {
  return (
    <div className="page-stack">
      <div className="page-header">
        <h1>Visitantes</h1>
        <p>
          Cadastre os visitantes pelo nome, parentesco e cidade.{' '}
          <Link to="/painel/visitantes" className="page-header-link">
            Ver painel →
          </Link>
        </p>
      </div>
      <div className="page-form">
        <VisitorForm onSuccess={() => undefined} />
      </div>
    </div>
  );
}
