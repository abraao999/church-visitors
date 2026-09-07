import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { GuestAccessOverview } from '../components/GuestAccessOverview';
import { PortariaDevicesSection } from '../components/PortariaDevicesSection';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../utils/permissions';
import type { Service } from '../types';
import { formatTodayLabel } from '../utils/date';
import { countdownLabel } from '../utils/serviceSchedule';
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
    to: '/avisos-veiculos',
    icon: 'car',
    title: 'Avisos de veículos',
    description: 'Veja e resolva os avisos de hoje',
  },
  {
    to: '/paineis',
    icon: 'panels',
    title: 'Abrir painéis',
    description: 'Visualize as informações da igreja',
  },
];

export function HomePage() {
  const { user } = useAuth();
  const canVisitors = hasPermission(user?.permissions, 'visitors:read') || user?.role === 'owner';
  const canPrayers = hasPermission(user?.permissions, 'prayers:read') || user?.role === 'owner';
  const canAccesses = hasPermission(user?.permissions, 'guest_accesses:read') || user?.role === 'owner';
  const canHolyrics = hasPermission(user?.permissions, 'holyrics:read') || user?.role === 'owner';
  const canPortariaDevices =
    hasPermission(user?.permissions, 'portaria_devices:read') || user?.role === 'owner';
  const visibleActions = QUICK_ACTIONS.filter((action) => {
    if (action.to === '/visitantes') return canVisitors || hasPermission(user?.permissions, 'visitors:create');
    if (action.to === '/oracao') return canPrayers || hasPermission(user?.permissions, 'prayers:create');
    if (action.to === '/cultos') return hasPermission(user?.permissions, 'services:read') || user?.role === 'owner';
    if (action.to === '/avisos-veiculos') {
      return hasPermission(user?.permissions, 'vehicle_notices:read') || user?.role === 'owner';
    }
    if (action.to === '/paineis') return hasPermission(user?.permissions, 'panels:open') || user?.role === 'owner';
    return true;
  });
  const [visitorCount, setVisitorCount] = useState(0);
  const [prayerCount, setPrayerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState('');
  const [activeService, setActiveService] = useState<Service | null>(null);
  const canServices = hasPermission(user?.permissions, 'services:read') || user?.role === 'owner';

  const loadData = useCallback(async () => {
    try {
      const tasks: Array<Promise<void>> = [];
      if (canVisitors) {
        tasks.push(api.getVisitorStats().then((v) => setVisitorCount(v.count)));
      }
      if (canPrayers) {
        tasks.push(api.getPrayerRequestStats().then((p) => setPrayerCount(p.count)));
      }
      await Promise.all(tasks);
      if (canServices) {
        try {
          const data = await api.getActiveService();
          setActiveService(data.service);
        } catch {
          setActiveService(null);
        }
      }
      setStatsError('');
    } catch {
      setStatsError('Não foi possível atualizar os números de hoje.');
    } finally {
      setLoading(false);
    }
  }, [canVisitors, canPrayers, canServices]);

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

      {activeService && (
        <Link to={`/cultos/${activeService._id}`} className="card home-active-service">
          <span className="home-active-dot" />
          <div>
            <strong>{activeService.statusLabel || 'Culto ativo'}</strong>
            <p>
              {activeService.title}
              {activeService.status === 'reception_open' && activeService.scheduledStartAt
                ? ` · começa em ${countdownLabel(activeService.scheduledStartAt, activeService.now) || 'instantes'}`
                : ''}
            </p>
          </div>
          <AppIcon name="arrow" />
        </Link>
      )}

      {statsError ? (
        <p className="error-message" role="alert">
          {statsError}
        </p>
      ) : null}

      <section className="dashboard-stats" aria-label="Resumo de hoje">
        {canVisitors && (
        <article className="dashboard-stat-card card">
          <span className="dashboard-stat-icon dashboard-stat-icon-blue"><AppIcon name="users" /></span>
          <div>
            <strong className="dashboard-stat-number">{loading ? '—' : visitorCount}</strong>
            <p>Visitantes hoje</p>
            <Link to="/visitantes">Ver visitantes <AppIcon name="arrow" /></Link>
          </div>
        </article>
        )}

        {canPrayers && (
        <article className="dashboard-stat-card card">
          <span className="dashboard-stat-icon dashboard-stat-icon-yellow"><AppIcon name="prayer" /></span>
          <div>
            <strong className="dashboard-stat-number">{loading ? '—' : prayerCount}</strong>
            <p>Pedidos de oração</p>
            <Link to="/oracao">Ver pedidos <AppIcon name="arrow" /></Link>
          </div>
        </article>
        )}
      </section>

      <div className="dashboard-main-grid">
        <section className="quick-actions-panel card">
          <h2>Ações rápidas</h2>
          <div className="quick-actions-grid">
            {visibleActions.map((action) => (
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

        {canAccesses && (
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
        )}
      </div>

      {canAccesses && <GuestAccessOverview />}
      {canPortariaDevices && !canAccesses && <PortariaDevicesSection />}

      {canHolyrics && (
      <section className="holyrics-dashboard-card card">
        <span className="holyrics-dashboard-icon"><AppIcon name="music" /></span>
        <div>
          <h2>Holyric</h2>
          <p>Conecte o Holyric para enviar letras aos painéis</p>
        </div>
        <Link to="/configuracoes">Configurar</Link>
      </section>
      )}
    </div>
  );
}
