import { Navigate, useLocation, useParams } from 'react-router-dom';
import { unifiedAuthPanelPath, unifiedPanelPath } from '../../utils/publicAccess';

/** Rotas antigas de visitantes e oração passam a abrir o painel unificado. */
export function LegacyPanelRedirect() {
  const { token } = useParams<{ token?: string }>();
  const { search } = useLocation();
  return <Navigate to={token ? unifiedPanelPath(token, search) : unifiedAuthPanelPath(search)} replace />;
}
