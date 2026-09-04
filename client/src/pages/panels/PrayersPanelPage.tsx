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
              <div className="display-item-heading-row">
                <h2 className="display-item-title">
                  {item.isAnonymous ? 'Anônimo' : item.name}
                </h2>
                <span className={`badge badge-${item.source}`}>
                  {item.source === 'guest_access'
                    ? 'Acesso de oração'
                    : item.source === 'owner'
                      ? 'Responsável'
                      : item.source === 'live'
                        ? 'Live (legado)'
                        : 'Portaria (legado)'}
                </span>
              </div>
              <p className="display-item-body">{item.request}</p>
              <p className="display-item-author">
                {item.source === 'guest_access'
                  ? `Enviado pelo acesso ${item.guestAccess?.name ?? 'de oração'}`
                  : item.createdBy?.name
                    ? `Registrado por ${item.createdBy.name}`
                    : item.source === 'live'
                      ? 'Enviado pelo link público antigo'
                      : 'Registro anterior da portaria'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </DisplayPanel>
  );
}
