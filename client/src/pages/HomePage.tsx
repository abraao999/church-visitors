import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { GuestAccessOverview } from '../components/GuestAccessOverview';
import { LivePrayerAccessCard } from '../components/LivePrayerAccessCard';
import { PortariaDevicesSection } from '../components/PortariaDevicesSection';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../utils/permissions';
import type { GuestAccess, PortariaDevice, Service } from '../types';
import { formatTodayLabel, todayLocalISO } from '../utils/date';
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

type PendingItemTone = 'blue' | 'yellow' | 'red' | 'green' | 'muted';

type PendingItem = {
  id: string;
  icon: AppIconName;
  tone: PendingItemTone;
  title: string;
  description: string;
  to: string;
  action: string;
};

function daysUntil(value?: string) {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

function staleDevices(devices: PortariaDevice[]) {
  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  return devices.filter((device) => (
    device.active &&
    (!device.lastUsedAt || new Date(device.lastUsedAt).getTime() < sevenDaysAgo)
  ));
}

export function HomePage() {
  const { user } = useAuth();
  const canVisitors = hasPermission(user?.permissions, 'visitors:read') || user?.role === 'owner';
  const canPrayers = hasPermission(user?.permissions, 'prayers:read') || user?.role === 'owner';
  const canAccesses = hasPermission(user?.permissions, 'guest_accesses:read') || user?.role === 'owner';
  const canHolyrics = hasPermission(user?.permissions, 'holyrics:read') || user?.role === 'owner';
  const canPortariaDevices =
    hasPermission(user?.permissions, 'portaria_devices:read') || user?.role === 'owner';
  const canVehicleNotices = hasPermission(user?.permissions, 'vehicle_notices:read') || user?.role === 'owner';
  const canPanels = hasPermission(user?.permissions, 'panels:open') || user?.role === 'owner';
  const canFollowUp =
    Boolean(user?.visitorFollowUpEnabled) &&
    (hasPermission(user?.permissions, 'follow_up:read') || user?.role === 'owner');
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
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
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
      const pending: PendingItem[] = [];
      if (canServices) {
        try {
          const data = await api.getActiveService();
          setActiveService(data.service);
          if (data.service && (data.service.counts?.hymns ?? data.service.hymns?.length ?? 0) === 0) {
            pending.push({
              id: 'service-hymns',
              icon: 'music',
              tone: 'yellow',
              title: 'Culto ativo sem louvores',
              description: `${data.service.title} ainda não possui louvores definidos.`,
              to: `/cultos/${data.service._id}`,
              action: 'Preparar culto',
            });
          }
        } catch {
          setActiveService(null);
        }
      }
      await Promise.all([
        canFollowUp
          ? api.getFollowUps({ status: 'awaiting' }).then((data) => {
              if (data.summary.awaiting > 0) {
                pending.push({
                  id: 'follow-up-awaiting',
                  icon: 'heartHand',
                  tone: 'blue',
                  title: `${data.summary.awaiting} visitante${data.summary.awaiting === 1 ? '' : 's'} aguardando acolhimento`,
                  description: 'Há visitantes que aceitaram acompanhamento e ainda precisam de contato.',
                  to: '/acompanhamento',
                  action: 'Ver acompanhamento',
                });
              }
              if (data.summary.today > 0) {
                pending.push({
                  id: 'follow-up-today',
                  icon: 'clock',
                  tone: 'yellow',
                  title: `${data.summary.today} contato${data.summary.today === 1 ? '' : 's'} para hoje`,
                  description: 'A equipe tem retornos programados para hoje.',
                  to: '/acompanhamento',
                  action: 'Abrir agenda',
                });
              }
            }).catch(() => undefined)
          : Promise.resolve(),
        canPrayers
          ? api.getPrayerRequests(todayLocalISO()).then((items) => {
              const news = items.filter((item) => (item.careStatus ?? 'new') === 'new').length;
              if (news > 0) {
                pending.push({
                  id: 'prayers-new',
                  icon: 'prayer',
                  tone: 'yellow',
                  title: `${news} pedido${news === 1 ? '' : 's'} de oração novo${news === 1 ? '' : 's'}`,
                  description: 'Revise os pedidos recebidos hoje e marque o cuidado da equipe.',
                  to: '/oracao',
                  action: 'Ver pedidos',
                });
              }
            }).catch(() => undefined)
          : Promise.resolve(),
        canVehicleNotices
          ? api.getVehicleNoticeStats(todayLocalISO()).then((stats) => {
              if (stats.pending > 0) {
                pending.push({
                  id: 'vehicle-pending',
                  icon: 'car',
                  tone: 'red',
                  title: `${stats.pending} aviso${stats.pending === 1 ? '' : 's'} de veículo pendente${stats.pending === 1 ? '' : 's'}`,
                  description: 'Há solicitações de veículos aguardando anúncio ou resolução.',
                  to: '/avisos-veiculos',
                  action: 'Abrir avisos',
                });
              }
            }).catch(() => undefined)
          : Promise.resolve(),
        canAccesses
          ? api.getGuestAccesses().then((accesses: GuestAccess[]) => {
              const expiring = accesses.filter((access) => {
                const days = daysUntil(access.expiresAt);
                return access.active && days !== null && days >= 0 && days <= 7;
              }).length;
              if (expiring > 0) {
                pending.push({
                  id: 'access-expiring',
                  icon: 'link',
                  tone: 'yellow',
                  title: `${expiring} acesso${expiring === 1 ? '' : 's'} público${expiring === 1 ? '' : 's'} perto de vencer`,
                  description: 'Renove ou confira os links e QR Codes antes do próximo culto.',
                  to: '/acessos',
                  action: 'Gerenciar acessos',
                });
              }
              const missingPanel = !accesses.some((access) => access.active && access.types.includes('panels:read'));
              if (missingPanel && canPanels) {
                pending.push({
                  id: 'panel-access-missing',
                  icon: 'panels',
                  tone: 'blue',
                  title: 'Nenhum acesso de TV ativo',
                  description: 'Crie um acesso sem login para abrir os painéis em computadores da igreja.',
                  to: '/acessos',
                  action: 'Criar acesso',
                });
              }
            }).catch(() => undefined)
          : Promise.resolve(),
        canHolyrics
          ? api.getHolyricsSettings().then((settings) => {
              const configured = settings.mode === 'internet' ? settings.hasApiKey : settings.hasToken;
              if (!configured) {
                pending.push({
                  id: 'holyrics-disconnected',
                  icon: 'music',
                  tone: 'muted',
                  title: 'Holyrics sem conexão configurada',
                  description: 'Configure a integração para enviar letras aos painéis com mais facilidade.',
                  to: '/configuracoes',
                  action: 'Configurar',
                });
              }
            }).catch(() => undefined)
          : Promise.resolve(),
        canPortariaDevices
          ? api.getPortariaDevices().then((devices) => {
              const stale = staleDevices(devices).length;
              if (stale > 0) {
                pending.push({
                  id: 'portaria-stale',
                  icon: 'users',
                  tone: 'muted',
                  title: `${stale} dispositivo${stale === 1 ? '' : 's'} da portaria sem sincronizar`,
                  description: 'Confira se os aparelhos da portaria ainda estão em uso.',
                  to: '/acessos',
                  action: 'Ver dispositivos',
                });
              }
            }).catch(() => undefined)
          : Promise.resolve(),
      ]);
      setPendingItems(pending);
      setStatsError('');
    } catch {
      setStatsError('Não foi possível atualizar os números de hoje.');
    } finally {
      setLoading(false);
    }
  }, [
    canVisitors,
    canPrayers,
    canServices,
    canFollowUp,
    canVehicleNotices,
    canAccesses,
    canPanels,
    canHolyrics,
    canPortariaDevices,
  ]);

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

      <section className="home-pending-center card" aria-labelledby="home-pending-title">
        <div className="home-pending-heading">
          <div>
            <span className="home-pending-eyebrow"><AppIcon name="check" /> Central de pendências</span>
            <h2 id="home-pending-title">O que precisa de atenção</h2>
            <p>Itens importantes do dia, reunidos em um só lugar.</p>
          </div>
          <span className={`home-pending-count${pendingItems.length === 0 ? ' is-clear' : ''}`}>
            {loading ? '...' : pendingItems.length}
          </span>
        </div>

        {loading ? (
          <p className="home-pending-empty">Verificando pendências...</p>
        ) : pendingItems.length === 0 ? (
          <div className="home-pending-empty is-clear">
            <AppIcon name="check" />
            <p>Nenhuma pendência importante agora.</p>
          </div>
        ) : (
          <div className="home-pending-list">
            {pendingItems.map((item) => (
              <Link key={item.id} to={item.to} className={`home-pending-item is-${item.tone}`}>
                <span className="home-pending-icon"><AppIcon name={item.icon} /></span>
                <span className="home-pending-copy">
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </span>
                <span className="home-pending-action">
                  {item.action}
                  <AppIcon name="arrow" />
                </span>
              </Link>
            ))}
          </div>
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
      {canAccesses && <LivePrayerAccessCard />}
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
