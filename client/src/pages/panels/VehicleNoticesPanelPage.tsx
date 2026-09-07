import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { AppIcon, type AppIconName } from '../../components/AppIcon';
import { formatPanelDayMonth, formatPanelWeekday } from '../../utils/date';
import {
  activeNoticesLabel,
  describeVehiclePanelChanges,
  sliceVehiclePanelPage,
  VEHICLE_PANEL_POLL_MS,
  VEHICLE_PANEL_ROTATE_MS,
  vehiclePanelLayoutMode,
  vehiclePanelPageCount,
  type VehiclePanelNotice,
} from '../../utils/vehicleNoticesTv';
import { usePanelAccess } from './usePanelAccess';
import './VehicleNoticesPanelPage.css';

const ACTION_ICONS: Record<string, AppIconName> = {
  remove_vehicle: 'tow',
  turn_off_lights: 'headlight',
  close_door_or_window: 'door',
  reposition_vehicle: 'reposition',
  other: 'chat',
};

export function VehicleNoticesPanelPage() {
  const { token, churchName: brandName } = usePanelAccess();
  const [notices, setNotices] = useState<VehiclePanelNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [pageIndex, setPageIndex] = useState(0);
  const [liveMessage, setLiveMessage] = useState('');
  const knownIdsRef = useRef<Set<string> | null>(null);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    if (document.visibilityState === 'hidden' && hasLoadedRef.current) return;
    try {
      const data = token
        ? await api.getPublicPanel<VehiclePanelNotice[]>(token, 'vehicle-notices')
        : await api.getVehicleNoticesPanel();
      const previous = knownIdsRef.current;
      const ids = data.map((item) => item.id);
      const announcement = describeVehiclePanelChanges(
        previous ? [...previous] : null,
        data
      );
      if (announcement) setLiveMessage(announcement);
      knownIdsRef.current = new Set(ids);

      setNotices(data);
      setLoadError(false);
      setForbidden(false);
      setReconnecting(false);
      hasLoadedRef.current = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/login|autoriz|sessão|sessao|acesso|válido|valido/i.test(message) && !hasLoadedRef.current) {
        setForbidden(true);
      } else if (hasLoadedRef.current) {
        setReconnecting(true);
      } else {
        setLoadError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const poll = window.setInterval(load, VEHICLE_PANEL_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(clock);
  }, []);

  const layout = vehiclePanelLayoutMode(notices.length);
  const pageCount = vehiclePanelPageCount(notices.length);
  const visible = useMemo(
    () => sliceVehiclePanelPage(notices, pageIndex),
    [notices, pageIndex]
  );

  useEffect(() => {
    setPageIndex((current) => (current >= pageCount ? 0 : current));
  }, [pageCount]);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (pageCount <= 1 || reduceMotion) return undefined;
    const rotate = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setPageIndex((current) => (current + 1) % pageCount);
    }, VEHICLE_PANEL_ROTATE_MS);
    return () => window.clearInterval(rotate);
  }, [pageCount]);

  const weekday = formatPanelWeekday(now);
  const dayMonth = formatPanelDayMonth(now);

  return (
    <div className={`vehicles-tv is-${layout}`} aria-busy={loading}>
      <div className="sr-only" aria-live="polite">
        {liveMessage}
      </div>

      <header className="vehicles-tv-top">
        <div className="vehicles-tv-brand">
          <span className="vehicles-tv-logo" aria-hidden="true">
            ✝
          </span>
          <span>{brandName}</span>
        </div>
        <div className="vehicles-tv-live">
          <span className="vehicles-tv-live-dot" aria-hidden="true" />
          {reconnecting ? 'RECONECTANDO…' : 'AO VIVO'}
        </div>
      </header>

      <section className="vehicles-tv-heading">
        <div>
          <h1>AVISOS DE VEÍCULOS</h1>
          <p>Confira se algum destes veículos é o seu</p>
        </div>
        <div className="vehicles-tv-date">
          <AppIcon name="calendar" />
          <div>
            <strong>{weekday}</strong>
            <span>{dayMonth}</span>
          </div>
        </div>
      </section>

      <div className="vehicles-tv-body">
        {forbidden ? (
          <div className="vehicles-tv-empty" role="alert">
            <span className="vehicles-tv-empty-icon" aria-hidden="true">
              <AppIcon name="lock" />
            </span>
            <p>Acesso indisponível</p>
            <small>Faça login novamente para exibir o painel nesta tela.</small>
          </div>
        ) : loading ? (
          <div className="vehicles-tv-empty">
            <span className="vehicles-tv-empty-icon" aria-hidden="true">
              <AppIcon name="car" />
            </span>
            <p>Carregando avisos...</p>
            <small>Os veículos aparecerão automaticamente nesta tela.</small>
          </div>
        ) : loadError ? (
          <div className="vehicles-tv-empty" role="alert">
            <span className="vehicles-tv-empty-icon" aria-hidden="true">
              <AppIcon name="info" />
            </span>
            <p>Não foi possível carregar os avisos</p>
            <small>A conexão será tentada novamente em instantes.</small>
          </div>
        ) : notices.length === 0 ? (
          <div className="vehicles-tv-empty">
            <span className="vehicles-tv-empty-icon" aria-hidden="true">
              <AppIcon name="car" />
            </span>
            <p>Nenhum aviso de veículo no momento</p>
            <small>Novos avisos aparecerão automaticamente aqui.</small>
          </div>
        ) : (
          <ul className="vehicles-tv-list" key={pageIndex}>
            {visible.map((notice, index) => {
              const featured = pageIndex === 0 && index === 0;
              return (
              <li
                key={notice.id}
                className={`vehicles-tv-card${featured ? ' is-featured' : ''}`}
              >
                <div className="vehicles-tv-card-copy">
                  {featured && <span className="vehicles-tv-attention">Atenção</span>}
                  <strong className="vehicles-tv-plate">{notice.plate}</strong>
                  <span className="vehicles-tv-model">{notice.vehicleModel}</span>
                  <span className="vehicles-tv-instruction">{notice.instruction}</span>
                </div>
                <span className="vehicles-tv-card-icon" aria-hidden="true">
                  <AppIcon name={ACTION_ICONS[notice.requestedAction] || 'car'} />
                </span>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="vehicles-tv-footer">
        <p>
          <span className="vehicles-tv-live-dot" aria-hidden="true" />
          {reconnecting ? 'Reconectando…' : 'Novos avisos aparecem automaticamente'}
        </p>
        <div className="vehicles-tv-footer-right">
          {pageCount > 1 && (
            <span className="vehicles-tv-pages">
              Página {pageIndex + 1} de {pageCount}
            </span>
          )}
          <strong>{activeNoticesLabel(notices.length)}</strong>
        </div>
      </footer>
    </div>
  );
}
