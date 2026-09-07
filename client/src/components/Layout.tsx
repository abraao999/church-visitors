import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useVehicleAlerts, VehicleAlertProvider } from '../alerts/VehicleAlertProvider';
import { formatPendingBadge, pendingBadgeLabel } from '../alerts/vehicleAlertLogic';
import { useAuth } from '../auth/AuthContext';
import { useBranding } from '../theme/BrandingContext';
import { AppIcon, type AppIconName } from './AppIcon';
import { BrandMark } from './BrandMark';
import { MobileNavDrawer } from './MobileNavDrawer';
import { ThemeToggle } from './ThemeToggle';
import { drawerSections, NAV_ITEMS } from './navItems';
import { navItemVisible } from '../utils/permissions';
import './Layout.css';

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
    <VehicleAlertProvider>
      <AuthenticatedShell pathname={location.pathname} />
    </VehicleAlertProvider>
  );
}

function VehicleNavBadge({ to }: { to: string }) {
  const alerts = useVehicleAlerts();
  if (to !== '/avisos-veiculos') return null;
  const count = alerts?.pendingCount ?? 0;
  const label = formatPendingBadge(count);
  if (!label) return null;
  return (
    <span className="nav-pending-badge" aria-label={pendingBadgeLabel(count)}>
      {label}
    </span>
  );
}

function AuthenticatedShell({ pathname }: { pathname: string }) {
  const { user, logout } = useAuth();
  const { branding } = useBranding();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerOpenRef = useRef(false);
  const brandName = branding?.name?.trim() || user?.churchName?.trim() || 'Church Visitors';
  const logoUrl = branding?.logoUrl;
  const navItems = NAV_ITEMS.filter((item) =>
    navItemVisible(item.to, user?.role, user?.permissions)
  );
  const { primary, admin } = drawerSections(navItems);

  drawerOpenRef.current = drawerOpen;

  useEffect(() => {
    document.title = brandName;
  }, [brandName]);

  useEffect(() => {
    if (!drawerOpenRef.current) return;
    setDrawerOpen(false);
    menuButtonRef.current?.focus();
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 769px)');
    function onChange() {
      if (media.matches) setDrawerOpen(false);
    }
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    queueMicrotask(() => menuButtonRef.current?.focus());
  }, []);

  function handleLogout() {
    setDrawerOpen(false);
    logout();
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="container header-inner">
          <button
            ref={menuButtonRef}
            type="button"
            className="mobile-menu-open"
            aria-expanded={drawerOpen}
            aria-controls="mobile-nav-drawer"
            aria-haspopup="dialog"
            onClick={() => setDrawerOpen(true)}
          >
            <AppIcon name="menu" />
            Menu
          </button>

          <Link to="/" className="logo">
            <BrandMark name={brandName} logoUrl={logoUrl} />
            <span className="logo-text">{brandName}</span>
          </Link>

          <div className="header-right">
            <nav className="nav nav-desktop" aria-label="Menu principal">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={isActive(pathname, item.to) ? 'active' : ''}
                >
                  <AppIcon name={item.icon as AppIconName} />
                  {item.label}
                  <VehicleNavBadge to={item.to} />
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

          {user && (
            <span className="mobile-user-avatar" title={user.name} aria-label={user.name}>
              <AppIcon name="user" />
            </span>
          )}
        </div>
      </header>

      <MobileNavDrawer
        open={drawerOpen}
        brandName={brandName}
        logoUrl={logoUrl}
        userName={user?.name}
        pathname={pathname}
        primary={primary}
        admin={admin}
        isActive={isActive}
        onClose={closeDrawer}
        onLogout={handleLogout}
        renderBadge={(to) => <VehicleNavBadge to={to} />}
      />

      <main className="app-main container">
        <Outlet />
      </main>
    </div>
  );
}
