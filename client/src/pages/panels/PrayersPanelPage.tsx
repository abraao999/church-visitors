import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { DisplayPanel } from '../../components/DisplayPanel';
import type { PrayerRequestPanelItem } from '../../types';
import { todayLocalISO } from '../../utils/date';
import { usePanelAccess } from './usePanelAccess';

export function PrayersPanelPage() {
  const { token } = usePanelAccess();
  const [prayers, setPrayers] = useState<PrayerRequestPanelItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const date = todayLocalISO();
      const data = token
        ? await api.getPublicPanel<PrayerRequestPanelItem[]>(token, 'prayers', date)
        : await api.getPrayerRequestsPanel(date);
      setPrayers(data);
    } catch {
      // painel segue tentando no próximo ciclo
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <DisplayPanel
      title="Pedidos de oração"
      subtitle="Pedidos autorizados a aparecer no telão"
      count={prayers.length}
      loading={loading}
    >
      {prayers.length === 0 ? (
        <p className="display-empty">Nenhum pedido autorizado para o telão ainda.</p>
      ) : (
        <ul className="display-list">
          {prayers.map((item) => (
            <li key={item._id} className="display-item">
              <div className="display-item-heading-row">
                <h2 className="display-item-title">
                  {item.isAnonymous || !item.name ? 'Anônimo' : item.name}
                </h2>
              </div>
              <p className="display-item-body">{item.request}</p>
            </li>
          ))}
        </ul>
      )}
    </DisplayPanel>
  );
}
