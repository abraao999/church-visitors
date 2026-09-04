import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { HymnsForm } from '../components/HymnsForm';
import { AppIcon } from '../components/AppIcon';
import { MonthCalendar } from '../components/MonthCalendar';
import { ServiceForm } from '../components/ServiceForm';
import type { HolyricsSyncResponse, Service } from '../types';
import { syncServiceToHolyricsBrowser } from '../utils/holyricsBrowserSync';
import './ServicesPage.css';

type Panel =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'edit'; service: Service }
  | { type: 'hymns'; service: Service };

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toISODate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthRange(year: number, month: number) {
  const from = `${year}-${pad(month + 1)}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${pad(month + 1)}-${pad(lastDay)}`;
  return { from, to };
}

function formatDayLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

function serviceDateKey(dateStr: string) {
  return dateStr.split('T')[0] ?? dateStr;
}

export function ServicesPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(toISODate(now));
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<Panel>({ type: 'none' });
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<HolyricsSyncResponse | null>(null);
  const [syncError, setSyncError] = useState('');

  const loadServices = useCallback(async () => {
    const { from, to } = monthRange(year, month);
    try {
      const data = await api.getServices({ from, to });
      setServices(data);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    setLoading(true);
    loadServices();
  }, [loadServices]);

  const datesWithServices = useMemo(() => {
    return new Set(services.map((s) => serviceDateKey(s.date)));
  }, [services]);

  const dayServices = useMemo(() => {
    return services.filter((s) => serviceDateKey(s.date) === selectedDate);
  }, [services, selectedDate]);

  function closePanel() {
    setPanel({ type: 'none' });
  }

  function handleChangeMonth(nextYear: number, nextMonth: number) {
    setYear(nextYear);
    setMonth(nextMonth);
    closePanel();
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    closePanel();
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este culto?')) return;
    await api.deleteService(id);
    if (
      (panel.type === 'edit' || panel.type === 'hymns') &&
      panel.service._id === id
    ) {
      closePanel();
    }
    loadServices();
  }

  function handleServiceSuccess(service?: Service, createdCount = 1) {
    loadServices();
    if (service) {
      if (createdCount > 1) {
        // Série recorrente: volta para a lista; hinos são por ocorrência.
        closePanel();
        return;
      }
      setPanel({ type: 'hymns', service });
      return;
    }
    closePanel();
  }

  function handleHymnsSuccess() {
    closePanel();
    loadServices();
  }

  async function handleSyncHolyrics(service: Service) {
    setSyncingId(service._id);
    setSyncError('');
    setSyncResult(null);

    try {
      try {
        const result = await api.syncHolyrics(service._id);
        setSyncResult(result);
        return;
      } catch (serverError) {
        const settings = await api.getHolyricsSettings();
        if (settings.mode === 'local' && settings.token) {
          const result = await syncServiceToHolyricsBrowser(service, settings);
          setSyncResult(result);
          return;
        }
        throw serverError;
      }
    } catch (error) {
      setSyncError(
        error instanceof Error
          ? error.message
          : 'Erro ao enviar ao Holyrics. Configure em Holyrics e tente de novo.'
      );
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div className="services-page">
      <section className="services-page-header">
        <div>
          <span className="services-eyebrow"><AppIcon name="calendar" /> Planejamento da igreja</span>
          <h1>Calendário de cultos</h1>
          <p>Selecione uma data para organizar o culto e os louvores daquele dia.</p>
        </div>
        <Link to="/configuracoes" className="services-holyrics-link">
          <AppIcon name="music" />
          <span><strong>Holyrics</strong><small>Configurar integração</small></span>
          <AppIcon name="arrow" />
        </Link>
      </section>

      <div className="services-layout">
        <MonthCalendar
          year={year}
          month={month}
          selectedDate={selectedDate}
          datesWithServices={datesWithServices}
          onSelectDate={handleSelectDate}
          onChangeMonth={handleChangeMonth}
        />

        <div className="services-day-panel">
          <div className="card services-day-card">
            <div className="day-panel-header">
              <div>
                <span className="day-panel-label">Data selecionada</span>
                <h2>Cultos do dia</h2>
                <p className="day-panel-date">{formatDayLabel(selectedDate)}</p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPanel({ type: 'create' })}
              >
                <AppIcon name="plus" /> Novo culto
              </button>
            </div>

            {loading ? (
              <p className="empty-state">Carregando...</p>
            ) : dayServices.length === 0 ? (
              <p className="empty-state">Nenhum culto neste dia.</p>
            ) : (
              <ul className="service-list">
                {dayServices.map((service) => (
                  <li key={service._id} className="service-item">
                    <div className="service-item-main">
                      <div className="service-item-title-row">
                        <span className="service-item-icon"><AppIcon name="calendar" /></span>
                        <strong>{service.title}</strong>
                        {service.time && <span className="service-time"><AppIcon name="clock" />{service.time}</span>}
                      </div>

                      {service.hymns.length === 0 ? (
                        <p className="service-hymns-empty">Nenhum louvor informado.</p>
                      ) : (
                        <ol className="service-hymns">
                          {service.hymns.map((hymn, index) => (
                            <li key={`${hymn.title}-${index}`}>
                              <span className="service-hymn-title">{hymn.title}</span>
                              {hymn.artist && (
                                <span className="service-singer"> · {hymn.artist}</span>
                              )}
                              {hymn.performedBy && (
                                <span className="service-performed-by">
                                  {' '}
                                  — cantado por {hymn.performedBy}
                                </span>
                              )}
                              {hymn.addedBy?.name && (
                                <span className="service-author">
                                  {' '}
                                  · por {hymn.addedBy.name}
                                </span>
                              )}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>

                    <div className="service-item-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setPanel({ type: 'hymns', service })}
                      >
                        <AppIcon name="music" />
                        {service.hymns.length === 0 ? 'Adicionar louvores' : 'Editar louvores'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={service.hymns.length === 0 || syncingId === service._id}
                        onClick={() => handleSyncHolyrics(service)}
                      >
                        <AppIcon name="external" />
                        {syncingId === service._id ? 'Enviando...' : 'Enviar ao Holyrics'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setPanel({ type: 'edit', service })}
                      >
                        <AppIcon name="edit" /> Editar culto
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handleDelete(service._id)}
                      >
                        <AppIcon name="trash" /> Remover
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {syncError && (
              <div className="sync-result sync-result-error" role="alert">
                <div className="sync-result-header">
                  <strong>Holyrics</strong>
                  <button type="button" className="btn-text" onClick={() => setSyncError('')}>
                    Fechar
                  </button>
                </div>
                <p>{syncError}</p>
                <p className="sync-result-hint">
                  Confira IP, porta e token em{' '}
                  <Link to="/configuracoes">Configurações Holyrics</Link>.
                </p>
              </div>
            )}

            {syncResult && (
              <div className="sync-result" role="status">
                <div className="sync-result-header">
                  <strong>Holyrics — {syncResult.serviceTitle}</strong>
                  <button type="button" className="btn-text" onClick={() => setSyncResult(null)}>
                    Fechar
                  </button>
                </div>
                <p>{syncResult.message}</p>
                <ul className="sync-result-list">
                  {syncResult.results.map((item, index) => (
                    <li key={`${item.title}-${index}`} className={`sync-status-${item.status}`}>
                      <span>
                        {item.title}
                        {item.artist ? ` · ${item.artist}` : ''}
                      </span>
                      <span className="sync-status-label">
                        {item.status === 'added' &&
                          (item.holyricsTitle
                            ? `Enviada (${item.holyricsTitle})`
                            : 'Enviada')}
                        {item.status === 'not_found' && 'Não encontrada'}
                        {item.status === 'error' && (item.message || 'Erro')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {(panel.type === 'create' || panel.type === 'edit') && (
            <ServiceForm
              selectedDate={selectedDate}
              editing={panel.type === 'edit' ? panel.service : null}
              onSuccess={handleServiceSuccess}
              onCancel={closePanel}
            />
          )}

          {panel.type === 'hymns' && (
            <HymnsForm
              service={panel.service}
              onSuccess={handleHymnsSuccess}
              onCancel={closePanel}
            />
          )}
        </div>
      </div>
    </div>
  );
}
