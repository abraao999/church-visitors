import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import { VisitorForm } from '../components/VisitorForm';
import { VisitorList } from '../components/VisitorList';
import type { Visitor } from '../types';
import { todayLocalISO } from '../utils/date';
import './VisitorsPage.css';

export function VisitorsPage() {
  const [selectedDate, setSelectedDate] = useState(todayLocalISO());
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [recordsError, setRecordsError] = useState('');

  const loadVisitors = useCallback(async () => {
    setRecordsError('');
    try {
      setVisitors(await api.getVisitors(selectedDate));
    } catch (error) {
      setRecordsError(error instanceof Error ? error.message : 'Não foi possível carregar os visitantes.');
    } finally {
      setLoadingRecords(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    setLoadingRecords(true);
    loadVisitors();
    const interval = window.setInterval(loadVisitors, 30000);
    return () => window.clearInterval(interval);
  }, [loadVisitors]);

  async function removeVisitor(id: string) {
    if (!window.confirm('Deseja remover este visitante? Esta ação não poderá ser desfeita.')) return;
    try {
      await api.deleteVisitor(id);
      await loadVisitors();
    } catch (error) {
      setRecordsError(error instanceof Error ? error.message : 'Não foi possível remover o visitante.');
    }
  }

  return (
    <div className="visitors-page">
      <section className="visitors-hero">
        <div className="visitors-hero-copy">
          <h1>Registrar visitantes</h1>
          <p>Preencha os dados das pessoas que estão nos visitando.</p>
        </div>
        <svg className="church-illustration" viewBox="0 0 180 130" aria-hidden="true">
          <path className="church-heart" d="M90 119C35 85 27 54 43 37c14-15 36-10 47 7 11-17 33-22 47-7 16 17 8 48-47 82Z" />
          <path className="church-cross" d="M90 15v27M80 25h20" />
          <path className="church-roof" d="m45 79 45-42 45 42" />
          <path className="church-building" d="M55 73v44h70V73L90 42 55 73Z" />
          <path className="church-door" d="M80 117V91a10 10 0 0 1 20 0v26" />
          <path className="church-window" d="M65 84h9v16h-9zm41 0h9v16h-9z" />
          <path className="church-ground" d="M35 118h110" />
        </svg>
      </section>

      <div className="visitors-form-wrap">
        <VisitorForm onSuccess={loadVisitors} />
      </div>

      <section className="private-records-section" aria-labelledby="visitors-records-title">
        <div className="private-records-heading">
          <div>
            <span className="private-records-eyebrow"><AppIcon name="users" /> Consulta privada</span>
            <h2 id="visitors-records-title">Visitantes registrados</h2>
            <p>{visitors.length} {visitors.length === 1 ? 'pessoa encontrada' : 'pessoas encontradas'}</p>
          </div>
          <label className="private-date-filter">
            <span>Data da visita</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>
        </div>

        {recordsError && <p className="error-message" role="alert">{recordsError}</p>}
        {loadingRecords ? (
          <div className="private-record-list card"><p className="empty-state">Carregando visitantes...</p></div>
        ) : (
          <VisitorList visitors={visitors} onDelete={removeVisitor} />
        )}
      </section>
    </div>
  );
}
