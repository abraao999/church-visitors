import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { DisplayPanel } from '../../components/DisplayPanel';
import type { PrayerRequest } from '../../types';
import { todayLocalISO } from '../../utils/date';

export function PrayersPanelPage() {
  const [prayers, setPrayers] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getPrayerRequests(todayLocalISO());
      setPrayers(data);
    } catch {
      // painel segue tentando no próximo ciclo
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <DisplayPanel
      title="Pedidos de oração"
      subtitle="Pedidos recebidos hoje"
      count={prayers.length}
      loading={loading}
    >
      {prayers.length === 0 ? (
        <p className="display-empty">Nenhum pedido de oração ainda.</p>
      ) : (
        <ul className="display-list">
          {prayers.map((item) => (
            <li key={item._id} className="display-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <h2 className="display-item-title" style={{ marginBottom: 0 }}>
                  {item.isAnonymous ? 'Anônimo' : item.name}
                </h2>
                <span className={`badge badge-${item.source}`}>
                  {item.source === 'live' ? 'Live' : 'Portaria'}
                </span>
              </div>
              <p className="display-item-body">{item.request}</p>
              {item.createdBy?.name && (
                <p className="display-item-author">Registrado por {item.createdBy.name}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </DisplayPanel>
  );
}
