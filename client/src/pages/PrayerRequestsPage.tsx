import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AppIcon } from '../components/AppIcon';
import { PrayerForm } from '../components/PrayerForm';
import { PrayerList } from '../components/PrayerList';
import type { PrayerCareStatus, PrayerRequest } from '../types';
import { todayLocalISO } from '../utils/date';
import { canChangePrayerCareStatus, hasPermission } from '../utils/permissions';
import './PrayerRequestsPage.css';

export function PrayerRequestsPage() {
  const { user } = useAuth();
  const canProject = hasPermission(user?.permissions, 'prayers:project') || user?.role === 'owner';
  const canChangeCare = canChangePrayerCareStatus(user?.role);
  const canDelete = hasPermission(user?.permissions, 'prayers:delete') || user?.role === 'owner';
  const [selectedDate, setSelectedDate] = useState(todayLocalISO());
  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [recordsError, setRecordsError] = useState('');

  const loadRequests = useCallback(async () => {
    setRecordsError('');
    try {
      setRequests(await api.getPrayerRequests(selectedDate));
    } catch (error) {
      setRecordsError(error instanceof Error ? error.message : 'Não foi possível carregar os pedidos.');
    } finally {
      setLoadingRecords(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    setLoadingRecords(true);
    loadRequests();
    const interval = window.setInterval(loadRequests, 30000);
    return () => window.clearInterval(interval);
  }, [loadRequests]);

  async function updateCare(id: string, status: PrayerCareStatus) {
    try {
      await api.updatePrayerCareStatus(id, status);
      await loadRequests();
    } catch (error) {
      setRecordsError(error instanceof Error ? error.message : 'Não foi possível atualizar o acompanhamento.');
    }
  }

  async function removeRequest(id: string) {
    if (!window.confirm('Deseja remover este pedido de oração? Esta ação não poderá ser desfeita.')) return;
    try {
      await api.deletePrayerRequest(id);
      await loadRequests();
    } catch (error) {
      setRecordsError(error instanceof Error ? error.message : 'Não foi possível remover o pedido.');
    }
  }

  return (
    <div className="prayer-page">
      <section className="prayer-page-hero">
        <div className="prayer-page-hero-copy">
          <span className="page-eyebrow"><AppIcon name="prayer" /> Atendimento na portaria</span>
          <h1>Pedidos de oração</h1>
          <p>Registre com cuidado os pedidos compartilhados pela igreja.</p>
        </div>
        {canProject && (
          <Link to="/paineis/culto" className="prayer-panel-link">
            <AppIcon name="panels" />
            <span><strong>Ver painel</strong><small>Acompanhar pedidos de hoje</small></span>
            <AppIcon name="arrow" />
          </Link>
        )}
      </section>
      <div className="prayer-page-form">
        <PrayerForm onSuccess={loadRequests} />
      </div>

      <section className="private-records-section" aria-labelledby="prayer-records-title">
        <div className="private-records-heading">
          <div>
            <span className="private-records-eyebrow"><AppIcon name="prayer" /> Consulta privada</span>
            <h2 id="prayer-records-title">Pedidos registrados</h2>
            <p>{requests.length} {requests.length === 1 ? 'pedido encontrado' : 'pedidos encontrados'}</p>
          </div>
          <label className="private-date-filter">
            <span>Data do pedido</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>
        </div>

        {recordsError && <p className="error-message" role="alert">{recordsError}</p>}
        {loadingRecords ? (
          <div className="private-record-list card"><p className="empty-state">Carregando pedidos...</p></div>
        ) : (
          <PrayerList
            requests={requests}
            onDelete={canDelete ? removeRequest : undefined}
            onCareChange={canChangeCare ? updateCare : undefined}
          />
        )}
      </section>
    </div>
  );
}
