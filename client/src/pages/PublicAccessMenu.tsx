import { Link } from 'react-router-dom';
import { AppIcon } from '../components/AppIcon';
import { BrandMark } from '../components/BrandMark';
import { useBranding } from '../theme/BrandingContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { PUBLIC_ACCESS_OPTIONS, publicFormPath } from '../utils/publicAccess';
import type { GuestAccessType } from '../types';
import './PublicAccessMenu.css';

export function PublicAccessMenu({
  token,
  churchName,
  types,
  deniedMessage,
}: {
  token: string;
  churchName: string;
  types: GuestAccessType[];
  deniedMessage?: string;
}) {
  const { branding } = useBranding();
  const cards = PUBLIC_ACCESS_OPTIONS.filter((option) => types.includes(option.type));

  return (
    <main className="public-access-page public-portal-page">
      <header className="public-access-brand">
        <BrandMark name={churchName} logoUrl={branding?.logoUrl} fallbackClassName="public-access-cross" />
        <div>
          <strong>{churchName}</strong>
          <span>Acesso da igreja</span>
        </div>
        <ThemeToggle compact />
      </header>

      <section className="public-portal-intro">
        <h1>Como podemos ajudar?</h1>
        <p>Escolha uma opção para continuar.</p>
      </section>

      <div className="public-portal-notice">
        <AppIcon name="lock" />
        <p>Você não precisa entrar no sistema.</p>
      </div>

      {deniedMessage && (
        <p className="public-portal-denied" role="status">
          {deniedMessage}
        </p>
      )}

      <nav className="public-portal-cards" aria-label="Opções deste acesso">
        {cards.map((card) => (
          <Link
            key={card.type}
            className={`public-portal-card is-${card.tone}`}
            to={publicFormPath(token, card.type)}
          >
            <span className="public-portal-card-icon" aria-hidden="true">
              <AppIcon name={card.icon} />
            </span>
            <span className="public-portal-card-copy">
              <strong>{card.title}</strong>
              <span>{card.description}</span>
              <em>Abrir formulário</em>
            </span>
            <span className="public-portal-card-go" aria-hidden="true">
              <AppIcon name="arrow" />
            </span>
          </Link>
        ))}
      </nav>

      <aside className="public-portal-secure">
        <AppIcon name="lock" />
        <div>
          <strong>Ambiente seguro</strong>
          <p>
            Cada informação será enviada somente para os responsáveis da {churchName}.
          </p>
        </div>
      </aside>

      <p className="public-portal-footnote">
        Escolheu a opção errada? Você poderá voltar a este menu.
      </p>
    </main>
  );
}
