import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { AppIcon } from '../../components/AppIcon';
import { BrandMark } from '../../components/BrandMark';
import { useBranding } from '../../theme/BrandingContext';
import type { WorshipPanelPayload } from '../../types';
import { formatPanelDayMonth, formatPanelWeekday } from '../../utils/date';
import {
  nextPollDelay,
  sharedWorshipPageCount,
  sliceRecycledPage,
  worshipEmptyState,
  WORSHIP_POLL_MS,
  WORSHIP_ROTATE_MS,
} from '../../utils/worshipPanel';
import { usePanelAccess } from './usePanelAccess';
import './WorshipPanelPage.css';

const EMPTY_PANEL: WorshipPanelPayload = {
  church: { name: 'Church Visitors', timezone: 'America/Sao_Paulo' },
  service: null,
  visitors: [],
  prayers: [],
  updatedAt: '',
};

export function WorshipPanelPage() {
  const { token, churchName: accessName, invalidToken } = usePanelAccess();
  const { branding, setPublicBranding } = useBranding();
  const [panel, setPanel] = useState<WorshipPanelPayload>(EMPTY_PANEL);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [pageIndex, setPageIndex] = useState(0);
  const failuresRef = useRef(0);
  const pollTimerRef = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const data = token
        ? await api.getPublicPanel<WorshipPanelPayload>(token, 'worship')
        : await api.getWorshipPanel();
      setPanel(data);
      setPublicBranding({
        name: data.church.name,
        logoUrl: data.church.logoUrl,
        primaryColor: data.church.primaryColor,
        accentColor: data.church.accentColor,
      });
      setOffline(false);
      failuresRef.current = 0;
    } catch {
      failuresRef.current += 1;
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [setPublicBranding, token]);

  useEffect(() => {
    let cancelled = false;

    function schedule(delay: number) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = window.setTimeout(async () => {
        if (cancelled || document.hidden) {
          schedule(delay);
          return;
        }
        await load();
        schedule(nextPollDelay(failuresRef.current));
      }, delay);
    }

    load();
    schedule(WORSHIP_POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(pollTimerRef.current);
    };
  }, [load]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(clock);
  }, []);

  const empty = worshipEmptyState({
    hasActiveService: Boolean(panel.service),
    visitorCount: panel.visitors.length,
    prayerCount: panel.prayers.length,
  });
  const pageCount = sharedWorshipPageCount(panel.visitors.length, panel.prayers.length);
  const visitors = sliceRecycledPage(panel.visitors, pageIndex);
  const prayers = sliceRecycledPage(panel.prayers, pageIndex);

  useEffect(() => {
    setPageIndex((current) => (pageCount > 0 && current >= pageCount ? 0 : current));
  }, [pageCount]);

  useEffect(() => {
    if (pageCount <= 1) return undefined;

    function rotate() {
      if (document.hidden) return;
      setPageIndex((current) => (current + 1) % pageCount);
    }

    const interval = window.setInterval(rotate, WORSHIP_ROTATE_MS);
    return () => window.clearInterval(interval);
  }, [pageCount]);

  const timezone = panel.church.timezone;
  const weekday = formatPanelWeekday(now, timezone);
  const dayMonth = formatPanelDayMonth(now, timezone);
  const churchName = panel.church.name?.trim() || accessName;
  const logoUrl = panel.church.logoUrl || branding?.logoUrl;
  const style = useMemo(
    () =>
      ({
        '--tv-primary': panel.church.primaryColor || branding?.primaryColor || '#2563eb',
        '--tv-accent': panel.church.accentColor || branding?.accentColor || '#b45309',
      }) as React.CSSProperties,
    [branding?.accentColor, branding?.primaryColor, panel.church.accentColor, panel.church.primaryColor]
  );

  if (invalidToken) {
    return (
      <main className="worship-tv worship-tv-message">
        <p>Este acesso de painel não é mais válido.</p>
      </main>
    );
  }

  return (
    <div
      className={`worship-tv is-${empty}${offline ? ' is-offline' : ''}`}
      style={style}
      aria-live="polite"
    >
      <header className="worship-tv-top">
        <div className="worship-tv-brand">
          <BrandMark name={churchName} logoUrl={logoUrl} fallbackClassName="worship-tv-logo" />
          <span>{churchName}</span>
        </div>
        <div className="worship-tv-meta">
          {panel.service && (
            <div className="worship-tv-live">
              <span className="worship-tv-live-dot" aria-hidden="true" />
              AO VIVO
            </div>
          )}
          <div className="worship-tv-date">
            <AppIcon name="calendar" />
            <div>
              <strong>{weekday}</strong>
              <span>{dayMonth}</span>
            </div>
          </div>
        </div>
      </header>

      <section className="worship-tv-heading">
        <h1>CULTO DE HOJE</h1>
        <p>Acompanhe as boas-vindas e os pedidos de oração</p>
      </section>

      {empty === 'inactive' ? (
        <div className="worship-tv-center">
          <p>Nenhum culto está ativo neste momento.</p>
        </div>
      ) : empty === 'waiting' && !loading ? (
        <div className="worship-tv-center">
          <p>Aguardando novos registros.</p>
        </div>
      ) : (
        <div className="worship-tv-columns">
          <section className={`worship-tv-column is-visitors${empty === 'prayers-empty' ? ' is-wide' : ''}`}>
            <div className="worship-tv-column-head">
              <AppIcon name="users" />
              <h2>VISITANTES DE HOJE</h2>
            </div>
            {empty === 'visitors-empty' || (loading && panel.visitors.length === 0) ? (
              <p className="worship-tv-column-empty">Nenhum visitante registrado neste culto.</p>
            ) : (
              <ul className="worship-tv-list">
                {visitors.map((group) => (
                  <li
                    key={group.id}
                    className={`worship-tv-card is-visitor-group${group.members.length > 1 ? ' is-group' : ''}`}
                  >
                    <span className="worship-tv-avatar" aria-hidden="true">
                      <AppIcon name={group.members.length > 1 ? 'users' : 'user'} />
                    </span>
                    <div className="worship-tv-card-copy">
                      <ul className="worship-tv-members">
                        {group.members.map((visitor) => (
                          <li key={visitor.id}>
                            <h3>{visitor.name}</h3>
                            {visitor.panelObservation && (
                              <p className="worship-tv-note">
                                <AppIcon name="chat" />
                                <span>{visitor.panelObservation}</span>
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                      {group.city && (
                        <p className="worship-tv-city">
                          <AppIcon name="pin" />
                          <span>{group.city}</span>
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={`worship-tv-column is-prayers${empty === 'visitors-empty' ? ' is-wide' : ''}`}>
            <div className="worship-tv-column-head">
              <AppIcon name="prayer" />
              <div>
                <h2>PEDIDOS DE ORAÇÃO</h2>
                <p>APROVADOS PARA EXIBIÇÃO</p>
              </div>
            </div>
            {empty === 'prayers-empty' || (loading && panel.prayers.length === 0) ? (
              <p className="worship-tv-column-empty">Nenhum pedido de oração aprovado para exibição.</p>
            ) : (
              <ul className="worship-tv-list">
                {prayers.map((prayer) => (
                  <li key={prayer.id} className="worship-tv-card is-prayer">
                    <span className="worship-tv-avatar" aria-hidden="true">
                      <AppIcon name="prayer" />
                    </span>
                    <div className="worship-tv-card-copy">
                      <h3>{prayer.text}</h3>
                      {prayer.firstName && !prayer.anonymous && (
                        <p className="worship-tv-person">{prayer.firstName}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <footer className="worship-tv-footer">
        <p>
          <AppIcon name="refresh" />
          <em>
            {offline
              ? 'Sem conexão. Novos registros voltam a aparecer automaticamente.'
              : 'Novos registros aparecem automaticamente'}
          </em>
        </p>
        {pageCount > 1 && (
          <span className="worship-tv-dots" aria-hidden="true">
            {Array.from({ length: pageCount }, (_, index) => (
              <i key={index} className={index === pageIndex ? 'is-active' : undefined} />
            ))}
          </span>
        )}
      </footer>
    </div>
  );
}
