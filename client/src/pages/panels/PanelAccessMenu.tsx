import { Link } from 'react-router-dom';
import { AppIcon } from '../../components/AppIcon';
import { BrandMark } from '../../components/BrandMark';
import { useBranding } from '../../theme/BrandingContext';
import { PANEL_OPTIONS, panelPath } from '../../utils/publicAccess';
import { usePanelAccess } from './usePanelAccess';
import '../PublicAccessMenu.css';

/**
 * Aberto pelo link de leitura no computador da TV: quem opera escolhe qual
 * painel projetar, sem precisar da senha do responsável.
 */
export function PanelAccessMenu() {
  const { token, churchName, invalidToken } = usePanelAccess();
  const { branding } = useBranding();

  if (!token || invalidToken) {
    return (
      <main className="public-access-page public-portal-page">
        <section className="public-portal-intro">
          <h1>Link de painel inválido</h1>
          <p>Peça ao responsável da igreja um novo link ou QR Code do painel.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="public-access-page public-portal-page">
      <header className="public-access-brand">
        <BrandMark name={churchName} logoUrl={branding?.logoUrl} fallbackClassName="public-access-cross" />
        <div>
          <strong>{churchName}</strong>
          <span>Painéis para projeção</span>
        </div>
      </header>

      <section className="public-portal-intro">
        <h1>Qual painel exibir?</h1>
        <p>Escolha o painel e deixe esta tela aberta na TV.</p>
      </section>

      <div className="public-portal-notice">
        <AppIcon name="lock" />
        <p>Este link só exibe informações. Não dá acesso ao sistema da igreja.</p>
      </div>

      <nav className="public-portal-cards" aria-label="Painéis disponíveis">
        {PANEL_OPTIONS.map((option) => (
          <Link
            key={option.path}
            className={`public-portal-card is-${option.tone}`}
            to={panelPath(token, option.path)}
          >
            <span className="public-portal-card-icon" aria-hidden="true">
              <AppIcon name={option.icon} />
            </span>
            <span className="public-portal-card-copy">
              <strong>{option.title}</strong>
              <span>{option.description}</span>
              <em>Abrir painel</em>
            </span>
            <span className="public-portal-card-go" aria-hidden="true">
              <AppIcon name="arrow" />
            </span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
