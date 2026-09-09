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
import {
  isNavItemActive,
  NAV_ITEMS,
  visibleNavSections,
  type NavBadge,
} from './navItems';
import { navItemVisible } from '../utils/permissions';
import './Layout.css';

export function Layout() {
  const location = useLocation();
  const isLive = location.pathname.startsWith('/live');
  const isDisplayPanel =
    location.pathname === '/paineis/culto' ||
    (location.pathname.startsWith('/painel/') && location.pathname !== '/paineis');

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

function VehicleNavBadge({ badge }: { badge?: NavBadge }) {
  const alerts = useVehicleAlerts();
  if (badge !== 'vehicleNotices') return null;
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
    navItemVisible(item.to, user?.role, user?.permissions, {
      visitorFollowUpEnabled: user?.visitorFollowUpEnabled === true,
    })
  );
  const sections = visibleNavSections(navItems);

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
              {sections.map((section) => {
                const headingId = section.label ? `desktop-nav-${section.id}` : undefined;
                return (
                  <div
                    key={section.id}
                    className="nav-section"
                    role={section.label ? 'group' : undefined}
                    aria-labelledby={headingId}
                  >
                    {section.label && (
                      <p id={headingId} className="nav-section-label">
                        {section.label}
                      </p>
                    )}
                    {section.items.map((item) => {
                      const active = isNavItemActive(pathname, item.to);
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          className={active ? 'active' : ''}
                          aria-current={active ? 'page' : undefined}
                        >
                          <AppIcon name={item.icon as AppIconName} />
                          <span className="nav-item-label">{item.label}</span>
                          <VehicleNavBadge badge={item.badge} />
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
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
        sections={sections}
        onClose={closeDrawer}
        onLogout={handleLogout}
        renderBadge={(badge) => <VehicleNavBadge badge={badge} />}
      />

      <main className="app-main container">
        <Outlet />
      </main>
    </div>
  );
}
