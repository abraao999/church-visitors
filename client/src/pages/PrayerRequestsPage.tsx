import { Link } from 'react-router-dom';
import { PrayerForm } from '../components/PrayerForm';

export function PrayerRequestsPage() {
  return (
    <div className="page-stack">
      <div className="page-header">
        <h1>Pedidos de Oração</h1>
        <p>
          Registre os pedidos pela portaria.{' '}
          <Link to="/painel/oracao" className="page-header-link">
            Ver painel →
          </Link>
        </p>
      </div>
      <div className="page-form">
        <PrayerForm source="porteiro" onSuccess={() => undefined} />
      </div>
    </div>
  );
}
