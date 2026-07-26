import { Link, Outlet, useLocation } from 'react-router-dom';
import './Layout.css';

export function Layout() {
  const location = useLocation();
  const isLive = location.pathname.startsWith('/live');

  if (isLive) {
    return (
      <div className="live-layout">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="container header-inner">
          <Link to="/" className="logo">
            <span className="logo-icon">✝</span>
            <span>Church Visitors</span>
          </Link>
          <nav className="nav">
            <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
              Início
            </Link>
            <Link to="/visitantes" className={location.pathname === '/visitantes' ? 'active' : ''}>
              Visitantes
            </Link>
            <Link to="/oracao" className={location.pathname === '/oracao' ? 'active' : ''}>
              Oração
            </Link>
          </nav>
        </div>
      </header>
      <main className="app-main container">
        <Outlet />
      </main>
    </div>
  );
}
