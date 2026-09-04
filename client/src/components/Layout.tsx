import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AppIcon, type AppIconName } from './AppIcon';
import { ThemeToggle } from './ThemeToggle';
import './Layout.css';

const NAV_ITEMS = [
  { to: '/', label: 'Início', short: 'Início', icon: 'home' },
  { to: '/visitantes', label: 'Visitantes', short: 'Visit.', icon: 'users' },
  { to: '/oracao', label: 'Oração', short: 'Oração', icon: 'prayer' },
  { to: '/acessos', label: 'Acessos', short: 'Acessos', icon: 'link' },
  { to: '/cultos', label: 'Cultos', short: 'Cultos', icon: 'calendar' },
  { to: '/paineis', label: 'Painéis', short: 'Painéis', icon: 'panels' },
  { to: '/configuracoes', label: 'Holyric', short: 'Holyric', icon: 'music' },
] as const;

const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.to !== '/acessos');

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isVisitorsPage = pathname === '/visitantes';

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  return (
    <div className={`app-layout${isVisitorsPage ? ' visitors-layout' : ''}`}>
      <header className="app-header">
        <div className="container header-inner">
          <Link to="/" className="logo">
            <span className="logo-icon">✝</span>
            <span className="logo-text">Church Visitors</span>
          </Link>

          {isVisitorsPage && <span className="mobile-page-title">Visitantes</span>}

          <div className="header-right">
            <nav className="nav nav-desktop" aria-label="Menu principal">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={isActive(pathname, item.to) ? 'active' : ''}
                >
                  <AppIcon name={item.icon as AppIconName} />
                  {item.label}
                </Link>
              ))}
            </nav>

            {user && (
              <div className="user-chip">
                <ThemeToggle />
                <div className="user-identity">
                  <span className="user-avatar"><AppIcon name="user" /></span>
                  <span className="user-chip-name" title={user.email}>{user.name}</span>
                </div>
                <button type="button" className="btn-logout" onClick={logout}>
                  <AppIcon name="logout" />
                  Sair
                </button>
              </div>
            )}
          </div>

          {isVisitorsPage && (
            <button
              type="button"
              className="mobile-menu-button"
              aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="visitors-mobile-menu"
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>
          )}
        </div>
      </header>

      {isVisitorsPage && mobileMenuOpen && (
        <div className="mobile-menu-backdrop" onClick={closeMobileMenu}>
          <nav
            id="visitors-mobile-menu"
            className="mobile-more-menu"
            aria-label="Outras opções"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-more-heading">
              <strong>Mais opções</strong>
              <button type="button" onClick={closeMobileMenu} aria-label="Fechar menu">Fechar</button>
            </div>
            <Link to="/oracao" onClick={closeMobileMenu}>Pedidos de oração</Link>
            <Link to="/acessos" onClick={closeMobileMenu}>Acessos sem login</Link>
            <Link to="/cultos" onClick={closeMobileMenu}>Calendário de cultos</Link>
            <Link to="/paineis" onClick={closeMobileMenu}>Painéis</Link>
            <Link to="/configuracoes" onClick={closeMobileMenu}>Configurações do Holyrics</Link>
            <button type="button" className="mobile-logout" onClick={logout}>Sair da conta</button>
          </nav>
        </div>
      )}

      <main className="app-main container">
        <Outlet />
      </main>

      {isVisitorsPage ? (
        <nav className="nav-mobile visitors-bottom-nav" aria-label="Menu inferior">
          <Link to="/">
            <NavIcon name="home" />
            <span className="nav-mobile-label">Início</span>
          </Link>
          <Link to="/visitantes" className="active" aria-current="page">
            <NavIcon name="people" />
            <span className="nav-mobile-label">Visitantes</span>
          </Link>
          <button type="button" onClick={() => setMobileMenuOpen(true)}>
            <NavIcon name="more" />
            <span className="nav-mobile-label">Mais</span>
          </button>
        </nav>
      ) : (
        <nav className="nav-mobile" aria-label="Menu inferior">
          {MOBILE_NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={isActive(pathname, item.to) ? 'active' : ''}
            >
              <AppIcon name={item.icon as AppIconName} />
              <span className="nav-mobile-label">{item.short}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

function NavIcon({ name }: { name: 'home' | 'people' | 'more' }) {
  if (name === 'home') {
    return (
      <svg className="nav-mobile-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z" />
      </svg>
    );
  }

  if (name === 'people') {
    return (
      <svg className="nav-mobile-icon nav-mobile-icon-fill" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM8 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8 1c-3.3 0-6 1.8-6 4v3h6v-3c0-2.2-2.7-4-6-4ZM8 14c-3.3 0-6 1.7-6 3.8V20h6v-3c0-1 .4-2 1.2-2.8-.4-.1-.8-.2-1.2-.2Z" />
      </svg>
    );
  }

  return (
    <svg className="nav-mobile-icon nav-mobile-icon-fill" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}
