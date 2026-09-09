import { type ReactNode, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AppIcon, type AppIconName } from './AppIcon';
import { BrandMark } from './BrandMark';
import { ThemeToggle } from './ThemeToggle';
import { isNavItemActive, type NavBadge, type NavSectionGroup } from './navItems';

interface Props {
  open: boolean;
  brandName: string;
  logoUrl?: string;
  userName?: string;
  pathname: string;
  sections: NavSectionGroup[];
  onClose: () => void;
  onLogout: () => void;
  renderBadge: (badge?: NavBadge) => ReactNode;
}

function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((node) => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true');
}

export function MobileNavDrawer({
  open,
  brandName,
  logoUrl,
  userName,
  pathname,
  sections,
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
            <BrandMark name={brandName} logoUrl={logoUrl} />
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
          {sections.map((section) => {
            const headingId = section.label ? `mobile-nav-${section.id}` : undefined;
            return (
              <div
                key={section.id}
                className="nav-section"
                role={section.label ? 'group' : undefined}
                aria-labelledby={headingId}
              >
                {section.label && (
                  <p id={headingId} className="mobile-drawer-section">
                    {section.label}
                  </p>
                )}
                <ul>
                  {section.items.map((item) => {
                    const active = isNavItemActive(pathname, item.to);
                    return (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          className={active ? 'active' : ''}
                          aria-current={active ? 'page' : undefined}
                          tabIndex={open ? 0 : -1}
                          onClick={onClose}
                        >
                          <AppIcon name={item.icon as AppIconName} />
                          <span className="nav-item-label">{item.label}</span>
                          {renderBadge(item.badge)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
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
