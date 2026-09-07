import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../utils/permissions';
import './ChurchSectionNav.css';

export function ChurchSectionNav() {
  const { user } = useAuth();
  const canTeam = hasPermission(user?.permissions, 'team:read') || user?.role === 'owner';
  const canChurch = hasPermission(user?.permissions, 'church:read') || user?.role === 'owner';

  return (
    <nav className="church-section-nav" aria-label="Área da igreja">
      {canChurch && (
        <NavLink to="/igreja" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Dados da igreja
        </NavLink>
      )}
      {canTeam && (
        <NavLink to="/igreja/equipe" className={({ isActive }) => (isActive ? 'active' : '')}>
          Equipe e permissões
        </NavLink>
      )}
    </nav>
  );
}
