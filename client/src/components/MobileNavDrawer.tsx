import { type ReactNode, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AppIcon, type AppIconName } from './AppIcon';
import { ThemeToggle } from './ThemeToggle';
import { drawerLabel, type NavItem } from './navItems';

interface Props {
  open: boolean;
  brandName: string;
  userName?: string;
  pathname: string;
  primary: NavItem[];
  admin: NavItem[];
  isActive: (pathname: string, to: string) => boolean;
  onClose: () => void;
  onLogout: () => void;
  renderBadge: (to: string) => ReactNode;
}

function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((node) => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true');
}

export function MobileNavDrawer({
  open,
  brandName,
  userName,
  pathname,
  primary,
  admin,
  isActive,
  onClose,
  onLogout,
  renderBadge,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    closeButtonRef.current?.focus();
    const items = panel ? focusableIn(panel) : [];
    if (document.activeElement !== closeButtonRef.current) {
      items[0]?.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = focusableIn(panel);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div
      className={`mobile-drawer-backdrop${open ? ' is-open' : ''}`}
      aria-hidden={!open}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        id="mobile-nav-drawer"
        className="mobile-drawer"
        role="dialog"
        aria-modal={open}
        aria-labelledby="mobile-drawer-title"
        inert={!open}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mobile-drawer-head">
          <div className="mobile-drawer-brand">
            <span className="logo-icon" aria-hidden="true">
              ✝
            </span>
            <strong id="mobile-drawer-title">{brandName}</strong>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="mobile-drawer-close"
            onClick={onClose}
            aria-label="Fechar menu"
            tabIndex={open ? 0 : -1}
          >
            <AppIcon name="close" />
          </button>
        </div>

        <nav className="mobile-drawer-nav" aria-label="Menu principal">
          <ul>
            {primary.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={isActive(pathname, item.to) ? 'active' : ''}
                  aria-current={isActive(pathname, item.to) ? 'page' : undefined}
                  tabIndex={open ? 0 : -1}
                  onClick={onClose}
                >
                  <AppIcon name={item.icon as AppIconName} />
                  {drawerLabel(item)}
                  {renderBadge(item.to)}
                </Link>
              </li>
            ))}
          </ul>

          {admin.length > 0 && (
            <>
              <p className="mobile-drawer-section" id="mobile-drawer-admin">
                ADMINISTRAÇÃO
              </p>
              <ul aria-labelledby="mobile-drawer-admin">
                {admin.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={isActive(pathname, item.to) ? 'active' : ''}
                      aria-current={isActive(pathname, item.to) ? 'page' : undefined}
                      tabIndex={open ? 0 : -1}
                      onClick={onClose}
                    >
                      <AppIcon name={item.icon as AppIconName} />
                      {drawerLabel(item)}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </nav>

        <div className="mobile-drawer-footer">
          <ThemeToggle label="Alterar tema" tabIndex={open ? 0 : -1} />
          {userName && <p className="mobile-drawer-user">{userName}</p>}
          <button type="button" className="mobile-drawer-logout" onClick={onLogout} tabIndex={open ? 0 : -1}>
            <AppIcon name="logout" />
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
