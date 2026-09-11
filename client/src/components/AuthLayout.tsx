import type { ReactNode } from 'react';
import { AppIcon } from './AppIcon';
import { ThemeToggle } from './ThemeToggle';
import '../pages/AuthPages.css';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-page">
      <div className="auth-shell">
        <aside className="auth-welcome">
          <div className="auth-welcome-brand">
            <span className="auth-logo-icon">✝</span>
            <span>Church Visitors</span>
            <ThemeToggle compact />
          </div>
          <div className="auth-welcome-copy">
            <span className="auth-eyebrow">Organização com propósito</span>
            <h1>Mais cuidado para receber e servir pessoas.</h1>
            <p>Visitantes, pedidos de oração e cultos organizados em um só lugar.</p>
          </div>
          <ul className="auth-feature-list">
            <li>
              <AppIcon name="users" />
              <span>
                <strong>Receba visitantes</strong>
                <small>Cadastre com rapidez na portaria</small>
              </span>
            </li>
            <li>
              <AppIcon name="prayer" />
              <span>
                <strong>Acolha pedidos</strong>
                <small>Centralize os pedidos de oração</small>
              </span>
            </li>
            <li>
              <AppIcon name="calendar" />
              <span>
                <strong>Organize os cultos</strong>
                <small>Planeje datas e louvores</small>
              </span>
            </li>
          </ul>
        </aside>

        <section className="auth-card card">
          <div className="auth-mobile-brand">
            <span className="auth-logo-icon">✝</span>
            <strong>Church Visitors</strong>
            <ThemeToggle compact />
          </div>
          <div className="auth-card-heading">
            <span className="auth-card-eyebrow">Área da equipe</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}
