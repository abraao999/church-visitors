import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useVehicleAlerts } from '../alerts/VehicleAlertProvider';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AppIcon } from '../components/AppIcon';
import {
  VEHICLE_NOTICE_ACTION_LABELS,
  type VehicleNotice,
  type VehicleNoticeStats,
  type VehicleNoticeStatus,
} from '../types';
import { todayLocalISO } from '../utils/date';
import { maskVehiclePlateInput } from '../utils/vehiclePlate';
import './VehicleNoticesPage.css';

const POLL_MS = 12_000;

const STATUS_FILTERS: Array<{ value: VehicleNoticeStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'announced', label: 'Anunciados' },
  { value: 'resolved', label: 'Resolvidos' },
];

const STATUS_LABELS: Record<VehicleNoticeStatus, string> = {
  pending: 'Pendente',
  announced: 'Anunciado',
  resolved: 'Resolvido',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Agora';
  if (minutes < 60) return `Há ${minutes} minuto${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours} hora${hours === 1 ? '' : 's'}`;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso)
  );
}

export function VehicleNoticesPage() {
  const { user } = useAuth();
  const alerts = useVehicleAlerts();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('aviso') || '';
  const [date, setDate] = useState(todayLocalISO());
  const [statusFilter, setStatusFilter] = useState<VehicleNoticeStatus | 'all'>(
    highlightId ? 'all' : 'pending'
  );
  const [plateSearch, setPlateSearch] = useState('');
  const [notices, setNotices] = useState<VehicleNotice[]>([]);
  const [stats, setStats] = useState<VehicleNoticeStats>({
    pending: 0,
    announced: 0,
    resolvedToday: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, summary] = await Promise.all([
        api.getVehicleNotices({
          date,
          status: statusFilter,
          plate: plateSearch.trim() || undefined,
        }),
        api.getVehicleNoticeStats(date),
      ]);
      setNotices(list);
      setStats(summary);
      setLastRefresh(new Date());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os avisos.');
    } finally {
      setLoading(false);
    }
  }, [date, statusFilter, plateSearch]);

  useEffect(() => {
    setLoading(true);
    load();
    const poll = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(poll);
  }, [load]);

  useEffect(() => {
    if (!highlightId) return;
    const row = document.getElementById(`aviso-${highlightId}`);
    row?.scrollIntoView({ block: 'center' });
  }, [highlightId, notices]);

  async function setStatus(
    id: string,
    status: VehicleNoticeStatus,
    currentStatus: VehicleNoticeStatus,
    updatedAt: string
  ) {
    if (status === 'pending' && currentStatus !== 'pending') {
      const from = currentStatus === 'resolved' ? 'resolvido' : 'anunciado';
      if (!window.confirm(`Reabrir este aviso ${from}? Ele volta a aparecer como pendente.`)) {
        return;
      }
    }

    setBusyId(id);
    setActionError('');
    try {
      await api.updateVehicleNoticeStatus(id, status, updatedAt);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Não foi possível atualizar o aviso.');
    } finally {
      setBusyId('');
    }
  }

  async function copyPanelAddress() {
    const url = `${window.location.origin}/painel/veiculos`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError('Não foi possível copiar o endereço do painel.');
    }
  }

  return (
    <div className="vehicle-notices-page">
      <header className="vehicle-notices-header">
        <div>
          <h1>Avisos de veículos</h1>
          <p>Acompanhe os avisos recebidos durante o culto.</p>
        </div>
        <div className="vehicle-notices-header-actions">
          {alerts && (
            <button type="button" className="btn btn-secondary" onClick={alerts.openSettings}>
              <AppIcon name="bell" />
              Configurar alertas
            </button>
          )}
          <Link to="/painel/veiculos" target="_blank" rel="noreferrer" className="vehicle-tv-link">
            <AppIcon name="panels" />
            <span>
              <strong>Exibir na TV</strong>
              <small>Abrir painel em nova aba</small>
            </span>
            <AppIcon name="external" />
          </Link>
          <button type="button" className="btn btn-secondary vehicle-copy-panel" onClick={copyPanelAddress}>
            <AppIcon name={copied ? 'check' : 'copy'} />
            {copied ? 'Endereço copiado' : 'Copiar endereço'}
          </button>
          <label className="vehicle-date-filter">
          <AppIcon name="calendar" />
          <span>{date === todayLocalISO() ? 'Culto de hoje' : 'Data'}</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value || todayLocalISO())}
            aria-label="Filtrar por data do culto"
          />
        </label>
        </div>
      </header>

      <div className="vehicle-stats">
        <article className="vehicle-stat card pending">
          <div>
            <span>Pendentes</span>
            <strong>{stats.pending}</strong>
          </div>
          <AppIcon name="bell" />
        </article>
        <article className="vehicle-stat card announced">
          <div>
            <span>Anunciado</span>
            <strong>{stats.announced}</strong>
          </div>
          <AppIcon name="megaphone" />
        </article>
        <article className="vehicle-stat card resolved">
          <div>
            <span>Resolvidos hoje</span>
            <strong>{stats.resolvedToday}</strong>
          </div>
          <AppIcon name="check" />
        </article>
      </div>

      <section className="card vehicle-notices-panel">
        <div className="vehicle-notices-toolbar">
          <div className="vehicle-status-tabs" role="tablist" aria-label="Filtrar por status">
            {STATUS_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={statusFilter === item.value}
                className={statusFilter === item.value ? 'active' : ''}
                onClick={() => setStatusFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="vehicle-search">
            <AppIcon name="search" />
            <span className="sr-only">Buscar por placa</span>
            <input
              value={plateSearch}
              onChange={(event) => setPlateSearch(maskVehiclePlateInput(event.target.value))}
              placeholder="Buscar por placa"
              maxLength={8}
            />
          </label>
        </div>

        <div className="vehicle-poll-hint">
          <AppIcon name="refresh" />
          Atualização automática
          {lastRefresh && (
            <span>
              · {lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {actionError && (
          <p className="error-message" role="alert">
            {actionError}
          </p>
        )}

        {loading ? (
          <p className="empty-state">Carregando avisos...</p>
        ) : error ? (
          <p className="empty-state">Tente novamente em instantes.</p>
        ) : notices.length === 0 ? (
          <p className="empty-state">
            {statusFilter === 'all' && !plateSearch.trim()
              ? 'Nenhum aviso recebido neste período.'
              : 'Nenhum aviso encontrado para este filtro.'}
          </p>
        ) : (
          <ul className="vehicle-notice-list">
            {notices.map((notice) => (
              <li
                key={notice.id}
                id={`aviso-${notice.id}`}
                className={`vehicle-notice-row${highlightId === notice.id ? ' is-highlighted' : ''}`}
              >
                <div className="vehicle-notice-main">
                  <span className="vehicle-notice-car">
                    <AppIcon name="car" />
                  </span>
                  <div className="vehicle-notice-plate">
                    <strong>{notice.plate}</strong>
                    <span>{notice.vehicleModel}</span>
                  </div>
                  <div className="vehicle-notice-action">
                    <strong>{VEHICLE_NOTICE_ACTION_LABELS[notice.requestedAction]}</strong>
                    {notice.otherDescription ? <span>{notice.otherDescription}</span> : null}
                    {notice.details ? <span>{notice.details}</span> : null}
                    <small>
                      {notice.source === 'guest_access'
                        ? notice.guestAccessName || 'Acesso convidado'
                        : 'Equipe da igreja'}
                    </small>
                  </div>
                  <div className="vehicle-notice-meta">
                    <time dateTime={notice.createdAt}>{relativeTime(notice.createdAt)}</time>
                    <span className={`vehicle-status-badge ${notice.status}`}>
                      {STATUS_LABELS[notice.status]}
                    </span>
                  </div>
                </div>
                <div className="vehicle-notice-actions">
                  {notice.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busyId === notice.id}
                        onClick={() => setStatus(notice.id, 'announced', notice.status, notice.updatedAt)}
                      >
                        Marcar como anunciado
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busyId === notice.id}
                        onClick={() => setStatus(notice.id, 'resolved', notice.status, notice.updatedAt)}
                      >
                        Resolver
                      </button>
                    </>
                  )}
                  {notice.status === 'announced' && (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busyId === notice.id}
                        onClick={() => setStatus(notice.id, 'resolved', notice.status, notice.updatedAt)}
                      >
                        Resolver
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busyId === notice.id}
                        onClick={() => setStatus(notice.id, 'pending', notice.status, notice.updatedAt)}
                      >
                        Reabrir
                      </button>
                    </>
                  )}
                  {notice.status === 'resolved' && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busyId === notice.id}
                      onClick={() => setStatus(notice.id, 'pending', notice.status, notice.updatedAt)}
                    >
                      Reabrir aviso
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="vehicle-tenant-note">
          <AppIcon name="lock" />
          Somente avisos da {user?.churchName || 'sua igreja'} aparecem aqui.
        </p>
      </section>
    </div>
  );
}
