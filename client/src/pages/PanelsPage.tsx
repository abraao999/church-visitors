import { Link } from 'react-router-dom';
import './PanelsPage.css';

const PANELS = [
  {
    to: '/painel/louvores',
    title: 'Louvores',
    description: 'Veja os hinos do culto de hoje, com cantor e quem vai louvar.',
  },
  {
    to: '/painel/visitantes',
    title: 'Visitantes',
    description: 'Acompanhe os visitantes registrados pela portaria.',
  },
  {
    to: '/painel/oracao',
    title: 'Pedidos de oração',
    description: 'Visualize os pedidos enviados pela portaria e pela live.',
  },
] as const;

export function PanelsPage() {
  return (
    <div className="panels-page">
      <section className="card panels-hero">
        <h1>Painéis de visualização</h1>
        <p>
          Abra cada painel em tela cheia para acompanhar as informações do culto. Ideal para
          projetor ou segunda tela.
        </p>
      </section>

      <section className="panels-grid">
        {PANELS.map((panel) => (
          <article key={panel.to} className="card panel-card">
            <h2>{panel.title}</h2>
            <p>{panel.description}</p>
            <div className="panel-card-actions">
              <Link to={panel.to} className="btn btn-primary">
                Abrir painel
              </Link>
              <a
                href={panel.to}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
              >
                Nova aba
              </a>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
