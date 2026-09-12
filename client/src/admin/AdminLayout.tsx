import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { AppIcon } from '../components/AppIcon';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAdminAuth } from './AdminAuthContext';
import { PLATFORM_ROLE_LABELS } from './adminTypes';
import './AdminLayout.css';

const NAV = [
  { to: '/admin', label: 'Visão geral', icon: 'chart' as const, end: true },
  { to: '/admin/igrejas', label: 'Igrejas', icon: 'pin' as const, end: false },
];

const SOON = [
  { label: 'Usuários', icon: 'users' as const },
  { label: 'Atividades', icon: 'clipboard' as const },
  { label: 'Saúde', icon: 'heartHand' as const },
  { label: 'Configurações', icon: 'settings' as const },
];

export function AdminLayout() {
  const { admin, logout } = useAdminAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="admin-shell">
      <header className="admin-mobile-bar">
        <button
          type="button"
          className="btn admin-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="admin-sidebar"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <AppIcon name="menu" />
          Menu
        </button>
        <strong>Eclesiafy Admin</strong>
        <ThemeToggle compact />
      </header>

      {menuOpen && (
        <button
          type="button"
          className="admin-nav-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside id="admin-sidebar" className={`admin-sidebar${menuOpen ? ' is-open' : ''}`}>
        <div className="admin-brand">
          <span className="admin-brand-mark" aria-hidden="true">✝</span>
          <div>
            <strong>Eclesiafy</strong>
            <span>ADMIN</span>
          </div>
        </div>
        <nav className="admin-nav" aria-label="Menu administrativo">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin-nav-link${isActive ? ' is-active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <AppIcon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
          {SOON.map((item) => (
            <span key={item.label} className="admin-nav-link is-disabled">
              <AppIcon name={item.icon} />
              <span>{item.label}</span>
              <small>Em breve</small>
            </span>
          ))}
        </nav>
        <div className="admin-sidebar-spacer" />
        <button type="button" className="admin-nav-link" onClick={() => void logout()}>
          <AppIcon name="logout" />
          Sair
        </button>
        <div className="admin-user">
          <span className="admin-avatar" aria-hidden="true">
            <AppIcon name="user" />
          </span>
          <div>
            <strong>{admin?.name}</strong>
            <span>{admin ? PLATFORM_ROLE_LABELS[admin.role] : ''}</span>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <span>Administração da plataforma</span>
          <div className="admin-topbar-meta">
            <span className="admin-secure-badge">
              <AppIcon name="shield" />
              Ambiente seguro
            </span>
            <span className="admin-topbar-user">
              {admin?.name} · {admin ? PLATFORM_ROLE_LABELS[admin.role] : ''}
            </span>
            <button type="button" className="btn admin-ghost" onClick={() => void logout()}>
              Sair
            </button>
            <span className="admin-theme-desktop">
              <ThemeToggle compact />
            </span>
          </div>
        </header>
        <div className="admin-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
