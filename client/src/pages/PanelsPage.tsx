import { Link } from 'react-router-dom';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import './PanelsPage.css';

const PANELS: Array<{
  to: string;
  title: string;
  description: string;
  icon: AppIconName;
  color: string;
}> = [
  {
    to: '/painel/louvores',
    title: 'Louvores',
    description: 'Veja os hinos do culto de hoje, com cantor e quem vai louvar.',
    icon: 'music',
    color: 'purple',
  },
  {
    to: '/painel/visitantes',
    title: 'Visitantes',
    description: 'Acompanhe os visitantes registrados pela portaria.',
    icon: 'users',
    color: 'blue',
  },
  {
    to: '/painel/oracao',
    title: 'Pedidos de oração',
    description: 'Visualize os pedidos enviados pela portaria e pela live.',
    icon: 'prayer',
    color: 'yellow',
  },
];

export function PanelsPage() {
  return (
    <div className="panels-page">
      <section className="panels-hero">
        <div>
          <span className="panels-eyebrow"><AppIcon name="panels" /> Exibição da igreja</span>
          <h1>Painéis de visualização</h1>
          <p>Escolha o conteúdo que deseja acompanhar no projetor ou em uma segunda tela.</p>
        </div>
        <div className="panels-tip">
          <AppIcon name="external" />
          <span><strong>Dica</strong><small>Use “Nova aba” para manter o sistema aberto.</small></span>
        </div>
      </section>

      <section className="panels-grid">
        {PANELS.map((panel, index) => (
          <article key={panel.to} className={`card panel-card panel-card-${panel.color}`}>
            <div className="panel-card-topline">
              <span className="panel-card-icon"><AppIcon name={panel.icon} /></span>
              <span className="panel-card-number">Painel {index + 1}</span>
            </div>
            <h2>{panel.title}</h2>
            <p>{panel.description}</p>
            <div className="panel-card-actions">
              <Link to={panel.to} className="btn btn-primary">
                <AppIcon name="panels" /> Abrir painel
              </Link>
              <a
                href={panel.to}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
              >
                <AppIcon name="external" /> Nova aba
              </a>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
