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

  function viewList() {
    document.getElementById('visitors-records')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="visitors-page">
      <div className="visitors-form-wrap">
        <VisitorForm onSuccess={loadVisitors} onViewList={viewList} />
      </div>

      <section id="visitors-records" className="private-records-section" aria-labelledby="visitors-records-title">
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
