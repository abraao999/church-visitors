import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import { RecurrenceEditModal } from '../components/RecurrenceEditModal';
import { ServiceForm } from '../components/ServiceForm';
import type { RecurrenceSeries, Service } from '../types';
import { addMinutesClock, longDateLabel, statusClass } from '../utils/serviceSchedule';
import './RecurrenceSeriesPage.css';

export function RecurrenceSeriesPage() {
  const { seriesId } = useParams();
  const [series, setSeries] = useState<RecurrenceSeries | null>(null);
  const [occurrences, setOccurrences] = useState<Service[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Service | null>(null);
  const [editScope, setEditScope] = useState<'this' | 'thisAndFuture'>('this');
  const [scopeFor, setScopeFor] = useState<Service | null>(null);

  const load = useCallback(async () => {
    if (!seriesId) return;
    try {
      const data = await api.getRecurrenceSeries(seriesId);
      setSeries(data.series);
      setOccurrences(data.occurrences);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a série.');
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 15000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function handleCancel(service: Service) {
    if (!confirm('Cancelar somente esta ocorrência? A série continua.')) return;
    await api.cancelServiceOccurrence(service._id);
    setScopeFor(null);
    await load();
  }

  if (loading) return <p className="empty-state">Carregando série...</p>;
  if (!series) return <p className="error-message">{error || 'Série não encontrada.'}</p>;

  const upcoming = occurrences.filter((item) => item.status !== 'cancelled').slice(0, 8);
  const reception = addMinutesClock(series.time, -(series.activationLeadMinutes || 30));

  return (
    <div className="series-page">
      <Link to="/cultos" className="series-back">
        <AppIcon name="arrow" /> Voltar aos cultos
      </Link>

      <header className="series-header">
        <div>
          <h1>{series.title}</h1>
          <span className="series-badge">{series.frequencyLabel}</span>
          <p>
            Todos os {['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'][series.weekday]} às {series.time}
            {' · até '}
            {longDateLabel(series.endDate.split('T')[0] || series.endDate)}
          </p>
        </div>
      </header>

      <section className="series-stats">
        <article className="card"><strong>{series.occurrenceCount ?? occurrences.length}</strong><span>Ocorrências</span></article>
        <article className="card"><strong>{reception}</strong><span>Abertura automática</span></article>
        <article className="card"><strong>{Math.round(series.durationMinutes / 60)}h</strong><span>Duração prevista</span></article>
      </section>

      <div className="series-layout">
        <section className="card series-list-card">
          <h2>Próximos cultos</h2>
          {error && <p className="error-message">{error}</p>}
          <ul className="series-occurrence-list">
            {upcoming.map((service) => (
              <li key={service._id} className="series-occurrence">
                <div>
                  <strong>{longDateLabel(service.dateKey || service.date)}</strong>
                  <p>
                    {service.time} · encerramento {service.plannedEndsAt ? new Date(service.plannedEndsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : addMinutesClock(service.time || series.time, series.durationMinutes)}
                  </p>
                  <span className={`service-status-badge ${statusClass(service.status)}`}>
                    {service.statusLabel}
                  </span>
                  {service.status === 'reception_open' && (
                    <small>Aberto automaticamente às {reception}</small>
                  )}
                  {service.status === 'scheduled' && (
                    <small>Será ativado às {reception}</small>
                  )}
                </div>
                <div className="series-occurrence-actions">
                  <Link to={`/cultos/${service._id}`} className="btn btn-primary">
                    {service.status === 'scheduled' ? 'Abrir culto' : 'Ver culto'}
                  </Link>
                  <button type="button" className="btn btn-secondary" onClick={() => setScopeFor(service)}>
                    Editar
                  </button>
                  <Link to={`/cultos/${service._id}`} className="btn btn-secondary">
                    <AppIcon name="music" /> Louvores
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="card series-auto-card">
          <h2>Automação</h2>
          <ul>
            <li><AppIcon name="check" /> Abrir recepção 30 minutos antes</li>
            <li><AppIcon name="check" /> Vincular registros ao culto ativo</li>
            <li><AppIcon name="check" /> Encerrar automaticamente após a duração prevista</li>
          </ul>
        </aside>
      </div>

      {scopeFor && (
        <RecurrenceEditModal
          service={{ ...scopeFor, series }}
          onChoose={(scope) => {
            setEditScope(scope);
            setEditing(scopeFor);
            setScopeFor(null);
          }}
          onCancelOccurrence={() => handleCancel(scopeFor)}
          onClose={() => setScopeFor(null)}
        />
      )}

      {editing && (
        <ServiceForm
          selectedDate={editing.dateKey || editing.date}
          editing={editing}
          editScope={editScope}
          onSuccess={() => {
            setEditing(null);
            load();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
