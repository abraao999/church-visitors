import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { GuestAccessOverview } from '../components/GuestAccessOverview';
import { formatTodayLabel } from '../utils/date';
import type { PrayerRequest, Visitor } from '../types';
import './HomePage.css';

const QUICK_ACTIONS: Array<{
  to: string;
  icon: AppIconName;
  title: string;
  description: string;
  primary?: boolean;
}> = [
  {
    to: '/visitantes',
    icon: 'users',
    title: 'Registrar visitantes',
    description: 'Cadastre quem chegou hoje',
    primary: true,
  },
  {
    to: '/oracao',
    icon: 'prayer',
    title: 'Pedido de oração',
    description: 'Registre um novo pedido',
  },
  {
    to: '/cultos',
    icon: 'calendar',
    title: 'Calendário de cultos',
    description: 'Organize cultos e louvores',
  },
  {
    to: '/paineis',
    icon: 'panels',
    title: 'Abrir painéis',
    description: 'Visualize as informações da igreja',
  },
];

export function HomePage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [prayers, setPrayers] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [v, p] = await Promise.all([api.getVisitors(), api.getPrayerRequests()]);
      setVisitors(v);
      setPrayers(p);
    } catch {
      // Mantém o dashboard disponível mesmo se os indicadores falharem.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const todayLabel = formatTodayLabel();
  const formattedDate = todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1);

  return (
    <div className="home-page">
      <header className="dashboard-heading">
        <div>
          <h1>Painel da Portaria</h1>
          <p>Acompanhe e organize as atividades de hoje.</p>
        </div>
        <div className="dashboard-date">
          <AppIcon name="calendar" />
          <span>{formattedDate}</span>
        </div>
      </header>

      <section className="dashboard-stats" aria-label="Resumo de hoje">
        <article className="dashboard-stat-card card">
          <span className="dashboard-stat-icon dashboard-stat-icon-blue"><AppIcon name="users" /></span>
          <div>
            <strong className="dashboard-stat-number">{loading ? '—' : visitors.length}</strong>
            <p>Visitantes hoje</p>
            <Link to="/visitantes">Ver visitantes <AppIcon name="arrow" /></Link>
          </div>
        </article>

        <article className="dashboard-stat-card card">
          <span className="dashboard-stat-icon dashboard-stat-icon-yellow"><AppIcon name="prayer" /></span>
          <div>
            <strong className="dashboard-stat-number">{loading ? '—' : prayers.length}</strong>
            <p>Pedidos de oração</p>
            <Link to="/oracao">Ver pedidos <AppIcon name="arrow" /></Link>
          </div>
        </article>
      </section>

      <div className="dashboard-main-grid">
        <section className="quick-actions-panel card">
          <h2>Ações rápidas</h2>
          <div className="quick-actions-grid">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className={`quick-action${action.primary ? ' quick-action-primary' : ''}`}
              >
                <AppIcon name={action.icon} className="quick-action-icon" />
                <span className="quick-action-copy">
                  <strong>{action.title}</strong>
                  <span>{action.description}</span>
                </span>
                <AppIcon name="arrow" className="quick-action-arrow" />
              </Link>
            ))}
          </div>
        </section>

        <aside className="online-link-card card">
          <h2>Acessos para convidados</h2>
          <p>Crie, renove e desative links seguros para sua equipe.</p>
          <Link to="/acessos" className="online-access-link">
            <AppIcon name="settings" />
            Gerenciar acessos
          </Link>
          <p className="online-link-status">
            <AppIcon name="check" />
            Isolados por igreja e permissão
          </p>
        </aside>
      </div>

      <GuestAccessOverview />

      <section className="holyrics-dashboard-card card">
        <span className="holyrics-dashboard-icon"><AppIcon name="music" /></span>
        <div>
          <h2>Holyric</h2>
          <p>Conecte o Holyric para enviar letras aos painéis</p>
        </div>
        <Link to="/configuracoes">Configurar</Link>
      </section>
    </div>
  );
}
