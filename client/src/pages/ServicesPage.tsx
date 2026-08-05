import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { HymnsForm } from '../components/HymnsForm';
import { MonthCalendar } from '../components/MonthCalendar';
import { ServiceForm } from '../components/ServiceForm';
import type { Service } from '../types';
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

  return (
    <div className="services-page">
      <div className="services-page-header">
        <h1>Calendário de cultos</h1>
        <p>
          Crie o culto (título, data e horário). Se for recorrente, ele se repete no mesmo dia da
          semana até o fim do ano. Depois adicione os louvores em cada ocorrência.
        </p>
      </div>

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
          <div className="card">
            <div className="day-panel-header">
              <div>
                <h2>Cultos do dia</h2>
                <p className="day-panel-date">{formatDayLabel(selectedDate)}</p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPanel({ type: 'create' })}
              >
                + Novo culto
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
                        <strong>{service.title}</strong>
                        {service.time && <span className="service-time">{service.time}</span>}
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
                        {service.hymns.length === 0 ? 'Adicionar louvores' : 'Editar louvores'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setPanel({ type: 'edit', service })}
                      >
                        Editar culto
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handleDelete(service._id)}
                      >
                        Remover
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
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
