import { Link } from 'react-router-dom';
import { formatTodayLabel } from '../utils/date';
import './DisplayPanel.css';

interface Props {
  title: string;
  subtitle?: string;
  count?: number;
  loading?: boolean;
  children: React.ReactNode;
}

export function DisplayPanel({ title, subtitle, count, loading, children }: Props) {
  return (
    <div className="display-panel">
      <header className="display-panel-header">
        <div>
          <p className="display-panel-date">{formatTodayLabel()}</p>
          <h1>
            {title}
            {typeof count === 'number' && !loading && (
              <span className="display-panel-count">{count}</span>
            )}
          </h1>
          {subtitle && <p className="display-panel-subtitle">{subtitle}</p>}
        </div>
        <Link to="/paineis" className="display-panel-back">
          Painéis
        </Link>
      </header>

      <div className="display-panel-body">
        {loading ? <p className="display-empty">Carregando...</p> : children}
      </div>
    </div>
  );
}
