import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import { GuestAccessQr, guestAccessUrl } from '../components/GuestAccessQr';
import { RecurrenceEditModal } from '../components/RecurrenceEditModal';
import { ServiceForm } from '../components/ServiceForm';
import type { GuestAccess, Service, ServiceActivity } from '../types';
import { countdownLabel, longDateLabel, serviceDateKey, statusClass } from '../utils/serviceSchedule';
import './ServiceOccurrencePage.css';

function isPortal(access: GuestAccess): boolean {
  const types = access.types?.length ? access.types : access.type ? [access.type] : [];
  return types.length > 1 && !types.includes('panels:read');
}

export function ServiceOccurrencePage() {
  const { serviceId } = useParams();
  const [service, setService] = useState<Service | null>(null);
  const [activity, setActivity] = useState<ServiceActivity | null>(null);
  const [portal, setPortal] = useState<GuestAccess | null>(null);
  const [error, setError] = useState('');
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [tick, setTick] = useState(Date.now());
  const [editing, setEditing] = useState(false);
  const [editScope, setEditScope] = useState<'this' | 'thisAndFuture'>('this');
  const [askScope, setAskScope] = useState(false);

  const load = useCallback(async () => {
    if (!serviceId) return;
    try {
      const [current, feed] = await Promise.all([
        api.getService(serviceId),
        api.getServiceActivity(serviceId),
      ]);
      setService(current);
      setActivity(feed);
      setFetchedAt(Date.now());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o culto.');
    }
  }, [serviceId]);

  useEffect(() => {
    load();
    const refresh = window.setInterval(load, 15000);
    const clock = window.setInterval(() => setTick(Date.now()), 1000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(clock);
    };
  }, [load]);

  useEffect(() => {
    api.getGuestAccesses().then((accesses) => {
      const unified = accesses.filter(isPortal);
      setPortal(unified.find((item) => item.active) || unified[0] || null);
    }).catch(() => undefined);
  }, []);

  const remaining = useMemo(() => {
    if (!service?.scheduledStartAt) return null;
    const elapsed = tick - fetchedAt;
    const serverNow = service.now ? new Date(service.now).getTime() + elapsed : Date.now();
    return countdownLabel(service.scheduledStartAt, new Date(serverNow).toISOString());
  }, [service, fetchedAt, tick]);

  async function handleOpen() {
    if (!service) return;
    setService(await api.openService(service._id));
  }

  async function handleClose() {
    if (!service) return;
    setService(await api.closeService(service._id));
  }

  async function handleExtend(minutes: 30 | 60) {
    if (!service) return;
    setService(await api.extendService(service._id, minutes));
  }

  async function handleCancel() {
    if (!service) return;
    if (!confirm('Cancelar somente esta ocorrência?')) return;
    setService(await api.cancelServiceOccurrence(service._id));
    setAskScope(false);
  }

  if (!service) {
    return <p className={error ? 'error-message' : 'empty-state'}>{error || 'Carregando culto...'}</p>;
  }

  const live = service.status === 'reception_open' || service.status === 'in_progress';
  const events = [
    ...(activity?.visitors ?? []).map((item) => ({
      at: item.createdAt,
      icon: 'users' as const,
      text: `Novo visitante: ${item.name}${item.city ? ` • ${item.city}` : ''}`,
    })),
    ...(activity?.prayers ?? []).map((item) => ({
      at: item.createdAt,
      icon: 'prayer' as const,
      text: `Pedido de oração recebido: ${item.guestAccess?.name || item.source || 'equipe'}`,
    })),
    ...(activity?.notices ?? []).map((item) => ({
      at: item.createdAt,
      icon: 'car' as const,
      text: `Aviso de veículo: ${item.plate}`,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="occurrence-page">
      <p className="occurrence-breadcrumb">
        <Link to="/cultos">Cultos</Link>
        {service.recurrenceSeriesId && (
          <>
            {' / '}
            <Link to={`/cultos/serie/${service.recurrenceSeriesId}`}>{service.title}</Link>
          </>
        )}
      </p>

      <header className="occurrence-header">
        <div>
          <p className={`occurrence-live ${statusClass(service.status)}`}>
            <span className="occurrence-dot" />
            {service.statusLabel}
          </p>
          <h1>{service.title}</h1>
          <p>
            {longDateLabel(service.dateKey || serviceDateKey(service.date))}
            {service.time ? ` • Culto às ${service.time}` : ''}
          </p>
        </div>
        <div className="occurrence-timer card">
          {service.status === 'reception_open' && remaining && (
            <strong>O culto começa em {remaining}</strong>
          )}
          {service.status === 'in_progress' && <strong>Culto em andamento</strong>}
          {service.receptionStartsAt && live && (
            <p>
              Aberto automaticamente às{' '}
              {new Date(service.receptionStartsAt).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
          <div className="occurrence-timer-actions">
            {service.status === 'scheduled' && (
              <button type="button" className="btn btn-primary" onClick={handleOpen}>
                Abrir culto
              </button>
            )}
            {live && (
              <>
                <button type="button" className="btn btn-secondary" onClick={handleClose}>
                  Encerrar antes
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => handleExtend(30)}>
                  + 30 min
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => handleExtend(60)}>
                  + 1 hora
                </button>
              </>
            )}
            {service.recurrenceSeriesId ? (
              <button type="button" className="btn btn-secondary" onClick={() => setAskScope(true)}>
                Editar
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
                Editar
              </button>
            )}
          </div>
        </div>
      </header>

      <section className="occurrence-stats">
        <article className="card"><AppIcon name="users" /><strong>{service.counts?.visitors ?? 0}</strong><span>Visitantes</span></article>
        <article className="card"><AppIcon name="prayer" /><strong>{service.counts?.prayers ?? 0}</strong><span>Pedidos de oração</span></article>
        <article className="card"><AppIcon name="car" /><strong>{service.counts?.pendingNotices ?? 0}</strong><span>Avisos pendentes</span></article>
        <article className="card"><AppIcon name="music" /><strong>{service.counts?.hymns ?? 0}</strong><span>Louvores</span></article>
      </section>

      <div className="occurrence-layout">
        <section className="card">
          <h2>Movimento da recepção</h2>
          <p className="occurrence-hint">Novos registros aparecem automaticamente</p>
          {events.length === 0 ? (
            <p className="empty-state">Nenhum registro vinculado a este culto ainda.</p>
          ) : (
            <ol className="occurrence-activity">
              {events.slice(0, 12).map((event) => (
                <li key={`${event.icon}-${event.at}-${event.text}`}>
                  <AppIcon name={event.icon} />
                  <div>
                    <time>
                      {new Date(event.at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                    <p>{event.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="occurrence-side">
          <section className="card">
            <h2>Vinculação automática</h2>
            <p>Novos registros {live ? 'estão sendo vinculados a este culto.' : 'não entram automaticamente neste culto.'}</p>
            <ul className="occurrence-links">
              <li>Portal público: <strong>{live ? 'Ativo' : 'Aguardando'}</strong></li>
              <li>Painéis da TV: <strong>{live ? 'Atualizando' : 'Sem culto ativo'}</strong></li>
              <li>
                Encerramento previsto:{' '}
                <strong>
                  {service.endsAt
                    ? new Date(service.endsAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'}
                </strong>
              </li>
            </ul>
          </section>

          <section className="card occurrence-access">
            <h2>Acesso deste culto</h2>
            {portal ? (
              <>
                <GuestAccessQr token={portal.token} name={portal.name} types={portal.types} compact />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigator.clipboard.writeText(guestAccessUrl(portal.token, portal.types))}
                >
                  <AppIcon name="copy" /> Copiar link
                </button>
                <p className="occurrence-hint">O mesmo portal público da igreja está em uso.</p>
              </>
            ) : (
              <p className="occurrence-hint">
                O portal público da igreja continua único. Crie ou abra o QR em Acessos.
              </p>
            )}
          </section>
        </div>
      </div>

      {askScope && (
        <RecurrenceEditModal
          service={service}
          onChoose={(scope) => {
            setEditScope(scope);
            setEditing(true);
            setAskScope(false);
          }}
          onCancelOccurrence={handleCancel}
          onClose={() => setAskScope(false)}
        />
      )}

      {editing && (
        <ServiceForm
          selectedDate={service.dateKey || serviceDateKey(service.date)}
          editing={service}
          editScope={editScope}
          onSuccess={() => {
            setEditing(false);
            load();
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}
