import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { AppIcon } from '../../components/AppIcon';
import type { Visitor } from '../../types';
import {
  formatClockTime,
  formatPanelDayMonth,
  formatPanelWeekday,
  todayLocalISO,
} from '../../utils/date';
import './VisitorsPanelPage.css';

const POLL_MS = 15_000;
const NEW_HIGHLIGHT_MS = 25_000;
const ROTATE_MS = 10_000;
const PAGE_SIZE_MANY = 6;
/** Janela para considerar o mesmo envio (insertMany / cadastro conjunto). */
const BATCH_WINDOW_MS = 2_500;

interface VisitorGroup {
  id: string;
  city: string;
  arrivedAt: string;
  members: Visitor[];
}

function sortByNewest(visitors: Visitor[]): Visitor[] {
  return [...visitors].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function batchStamp(visitor: Visitor): number {
  return new Date(visitor.visitDate || visitor.createdAt).getTime();
}

function groupVisitors(visitors: Visitor[]): VisitorGroup[] {
  const sorted = sortByNewest(visitors);
  const groups: VisitorGroup[] = [];

  for (const visitor of sorted) {
    const city = visitor.city?.trim() || 'Cidade não informada';
    const stamp = batchStamp(visitor);
    const open = groups.find(
      (group) =>
        group.city === city &&
        Math.abs(new Date(group.arrivedAt).getTime() - stamp) <= BATCH_WINDOW_MS
    );

    if (open) {
      open.members.push(visitor);
      if (stamp > new Date(open.arrivedAt).getTime()) {
        open.arrivedAt = visitor.visitDate || visitor.createdAt;
      }
    } else {
      groups.push({
        id: visitor._id,
        city,
        arrivedAt: visitor.visitDate || visitor.createdAt,
        members: [visitor],
      });
    }
  }

  for (const group of groups) {
    group.members.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  return groups;
}

function countLabel(count: number): string {
  if (count === 0) return 'Nenhum visitante chegou ainda';
  if (count === 1) return '1 pessoa chegou hoje';
  return `${count} pessoas chegaram hoje`;
}

function densityClass(groupCount: number, personCount: number): string {
  if (personCount <= 1) return 'is-single';
  if (groupCount <= 4 && personCount <= 8) return 'is-few';
  return 'is-many';
}

function pageSizeFor(groupCount: number): number {
  if (groupCount <= 4) return Math.max(groupCount, 1);
  return PAGE_SIZE_MANY;
}

export function VisitorsPanelPage() {
  const { user } = useAuth();
  const brandName = user?.churchName?.trim() || 'Church Visitors';
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [pageIndex, setPageIndex] = useState(0);
  const [newUntil, setNewUntil] = useState<Record<string, number>>({});
  const knownIdsRef = useRef<Set<string> | null>(null);
  const newTimersRef = useRef<Map<string, number>>(new Map());

  const clearNewTimers = useCallback(() => {
    for (const timer of newTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    newTimersRef.current.clear();
  }, []);

  const markAsNew = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const until = Date.now() + NEW_HIGHLIGHT_MS;
    setNewUntil((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = until;
      return next;
    });

    for (const id of ids) {
      const previous = newTimersRef.current.get(id);
      if (previous) window.clearTimeout(previous);
      const timer = window.setTimeout(() => {
        setNewUntil((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        newTimersRef.current.delete(id);
      }, NEW_HIGHLIGHT_MS);
      newTimersRef.current.set(id, timer);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const data = sortByNewest(await api.getVisitors(todayLocalISO()));
      const ids = data.map((visitor) => visitor._id);

      if (knownIdsRef.current === null) {
        knownIdsRef.current = new Set(ids);
      } else {
        const freshIds = ids.filter((id) => !knownIdsRef.current!.has(id));
        if (freshIds.length > 0) {
          markAsNew(freshIds);
          for (const id of freshIds) knownIdsRef.current.add(id);
        }
        for (const id of ids) knownIdsRef.current.add(id);
      }

      setVisitors(data);
    } catch {
      // painel segue tentando no próximo ciclo
    } finally {
      setLoading(false);
    }
  }, [markAsNew]);

  useEffect(() => {
    load();
    const poll = window.setInterval(load, POLL_MS);
    return () => {
      window.clearInterval(poll);
      clearNewTimers();
    };
  }, [clearNewTimers, load]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  const groups = useMemo(() => groupVisitors(visitors), [visitors]);
  const pageSize = pageSizeFor(groups.length);
  const pageCount = Math.max(1, Math.ceil(groups.length / pageSize) || 1);

  useEffect(() => {
    setPageIndex((current) => (current >= pageCount ? 0 : current));
  }, [pageCount]);

  useEffect(() => {
    if (pageCount <= 1) return undefined;
    const rotate = window.setInterval(() => {
      setPageIndex((current) => (current + 1) % pageCount);
    }, ROTATE_MS);
    return () => window.clearInterval(rotate);
  }, [pageCount]);

  const visibleGroups = useMemo(() => {
    const start = pageIndex * pageSize;
    return groups.slice(start, start + pageSize);
  }, [groups, pageIndex, pageSize]);

  const weekday = formatPanelWeekday(now);
  const dayMonth = formatPanelDayMonth(now);
  const clock = formatClockTime(now);
  const density = densityClass(groups.length, visitors.length);

  return (
    <div className={`visitors-tv ${density}`} aria-live="polite">
      <header className="visitors-tv-top">
        <div className="visitors-tv-brand">
          <span className="visitors-tv-logo" aria-hidden="true">✝</span>
          <span>{brandName}</span>
        </div>
        <div className="visitors-tv-live">
          <span className="visitors-tv-live-dot" aria-hidden="true" />
          AO VIVO
        </div>
      </header>

      <section className="visitors-tv-heading">
        <div>
          <h1>VISITANTES DE HOJE</h1>
          <p>{loading ? 'Carregando visitantes...' : countLabel(visitors.length)}</p>
        </div>
        <div className="visitors-tv-date">
          <AppIcon name="calendar" />
          <div>
            <strong>{weekday}</strong>
            <span>{dayMonth}</span>
          </div>
        </div>
      </section>

      <div className="visitors-tv-body">
        {!loading && visitors.length === 0 ? (
          <div className="visitors-tv-empty">
            <span className="visitors-tv-empty-icon" aria-hidden="true">
              <AppIcon name="users" />
            </span>
            <p>Nenhum visitante chegou ainda.</p>
            <small>Novos registros aparecerão automaticamente aqui.</small>
          </div>
        ) : (
          <ul className="visitors-tv-list" key={pageIndex}>
            {visibleGroups.map((group) => {
              const isNew = group.members.some((member) => (newUntil[member._id] ?? 0) > Date.now());
              const isGroup = group.members.length > 1;
              return (
                <li
                  key={group.id}
                  className={`visitors-tv-card${isGroup ? ' is-group' : ''}${isNew ? ' is-new' : ''}`}
                >
                  <span className="visitors-tv-avatar" aria-hidden="true">
                    <AppIcon name={isGroup ? 'users' : 'user'} />
                  </span>
                  <div className="visitors-tv-card-main">
                    <ul className="visitors-tv-names">
                      {group.members.map((member) => (
                        <li key={member._id}>
                          <h2>{member.name}</h2>
                        </li>
                      ))}
                    </ul>
                    <div className="visitors-tv-card-meta">
                      {isNew && <span className="visitors-tv-new">NOVO</span>}
                      {isGroup && (
                        <span className="visitors-tv-group-count">
                          {group.members.length} pessoas
                        </span>
                      )}
                      <time dateTime={group.arrivedAt}>
                        {formatClockTime(new Date(group.arrivedAt))}
                      </time>
                    </div>
                  </div>
                  <div className="visitors-tv-city">
                    <AppIcon name="pin" />
                    <span>{group.city}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="visitors-tv-footer">
        <p>
          <AppIcon name="users" />
          <em>Obrigado por visitar nossa igreja!</em>
        </p>
        <div className="visitors-tv-footer-right">
          {pageCount > 1 && (
            <span className="visitors-tv-pages" aria-hidden="true">
              {pageIndex + 1}/{pageCount}
            </span>
          )}
          <span className="visitors-tv-clock">
            <AppIcon name="clock" />
            {clock}
          </span>
        </div>
      </footer>
    </div>
  );
}
