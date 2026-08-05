import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import './Layout.css';

const NAV_ITEMS = [
  { to: '/', label: 'Início', short: 'Início' },
  { to: '/visitantes', label: 'Visitantes', short: 'Visit.' },
  { to: '/oracao', label: 'Oração', short: 'Oração' },
  { to: '/cultos', label: 'Cultos', short: 'Cultos' },
  { to: '/paineis', label: 'Painéis', short: 'Painéis' },
] as const;

function isActive(pathname: string, to: string) {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function Layout() {
  const location = useLocation();
  const isLive = location.pathname.startsWith('/live');
  const isDisplayPanel =
    location.pathname.startsWith('/painel/') && location.pathname !== '/paineis';

  if (isLive || isDisplayPanel) {
    return (
      <div className={isDisplayPanel ? 'panel-layout' : 'live-layout'}>
        <Outlet />
      </div>
    );
  }

  return (
    <AuthenticatedShell pathname={location.pathname} />
  );
}

function AuthenticatedShell({ pathname }: { pathname: string }) {
  const { user, logout } = useAuth();

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="container header-inner">
          <Link to="/" className="logo">
            <span className="logo-icon">✝</span>
            <span className="logo-text">Church Visitors</span>
          </Link>

          <div className="header-right">
            <nav className="nav nav-desktop" aria-label="Menu principal">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={isActive(pathname, item.to) ? 'active' : ''}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {user && (
              <div className="user-chip">
                <span className="user-chip-name" title={user.email}>
                  {user.name}
                </span>
                <button type="button" className="btn btn-secondary btn-logout" onClick={logout}>
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="app-main container">
        <Outlet />
      </main>

      <nav className="nav-mobile" aria-label="Menu inferior">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={isActive(pathname, item.to) ? 'active' : ''}
          >
            <span className="nav-mobile-label">{item.short}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
