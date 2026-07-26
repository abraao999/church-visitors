import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { PrayerForm } from '../components/PrayerForm';
import { PrayerList } from '../components/PrayerList';
import type { PrayerRequest } from '../types';

export function PrayerRequestsPage() {
  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRequests = useCallback(async () => {
    try {
      const data = await api.getPrayerRequests();
      setRequests(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
    const interval = setInterval(loadRequests, 15000);
    return () => clearInterval(interval);
  }, [loadRequests]);

  async function handleDelete(id: string) {
    if (!confirm('Remover este pedido?')) return;
    await api.deletePrayerRequest(id);
    loadRequests();
  }

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Pedidos de Oração</h1>
      <div className="grid-2">
        <PrayerForm source="porteiro" onSuccess={loadRequests} />
        {loading ? (
          <div className="card">
            <p className="empty-state">Carregando...</p>
          </div>
        ) : (
          <PrayerList requests={requests} onDelete={handleDelete} />
        )}
      </div>
    </div>
  );
}
