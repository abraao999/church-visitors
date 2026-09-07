import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useBranding } from '../theme/BrandingContext';
import { AppIcon } from './AppIcon';
import { BrandMark } from './BrandMark';
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
  const { user } = useAuth();
  const { branding } = useBranding();
  const brandName = branding?.name?.trim() || user?.churchName?.trim() || 'Church Visitors';

  return (
    <div className="display-panel">
      <div className="display-panel-brand">
        <BrandMark name={brandName} logoUrl={branding?.logoUrl} fallbackClassName="display-panel-logo" />
        <span>{brandName}</span>
      </div>
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
        <div className="display-panel-tools">
          <span className="display-panel-live"><span aria-hidden="true" /> Atualização automática</span>
          <Link to="/paineis" className="display-panel-back">
            <AppIcon name="arrow" /> Voltar aos painéis
          </Link>
        </div>
      </header>

      <div className="display-panel-body">
        {loading ? <p className="display-empty">Carregando...</p> : children}
      </div>
    </div>
  );
}
