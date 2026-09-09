import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { hasAnyPermission, type Permission } from '../utils/permissions';

export function PermissionRoute({
  anyOf,
  requireFollowUp,
}: {
  anyOf: Permission[];
  requireFollowUp?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-loading">
        <p>Carregando...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requireFollowUp && user.visitorFollowUpEnabled !== true) {
    return <Navigate to="/sem-acesso" replace state={{ reason: 'follow-up-disabled' }} />;
  }

  if (user.role !== 'owner' && !hasAnyPermission(user.permissions, anyOf)) {
    return <Navigate to="/sem-acesso" replace />;
  }

  return <Outlet />;
}
