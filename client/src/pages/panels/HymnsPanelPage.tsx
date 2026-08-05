import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { DisplayPanel } from '../../components/DisplayPanel';
import type { Service } from '../../types';
import { todayLocalISO } from '../../utils/date';

export function HymnsPanelPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getServices({ date: todayLocalISO() });
      setServices(data);
    } catch {
      // painel segue tentando no próximo ciclo
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const hymnCount = services.reduce((sum, s) => sum + s.hymns.length, 0);

  return (
    <DisplayPanel
      title="Louvores"
      subtitle="Hinos do culto de hoje"
      count={hymnCount}
      loading={loading}
    >
      {services.length === 0 ? (
        <p className="display-empty">Nenhum culto cadastrado para hoje.</p>
      ) : services.every((s) => s.hymns.length === 0) ? (
        <p className="display-empty">Nenhum louvor informado ainda.</p>
      ) : (
        <div>
          {services.map((service) => (
            <section key={service._id} className="display-service-block display-item">
              <h2 className="display-item-title">
                {service.title}
                {service.time ? ` · ${service.time}` : ''}
              </h2>

              {service.hymns.length === 0 ? (
                <p className="display-item-meta">Sem louvores neste culto.</p>
              ) : (
                <ol className="display-hymn-list">
                  {service.hymns.map((hymn, index) => (
                    <li key={`${service._id}-${index}`} className="display-hymn">
                      <span className="display-hymn-order">{index + 1}</span>
                      <div>
                        <p className="display-hymn-title">{hymn.title}</p>
                        <p className="display-hymn-details">
                          {hymn.artist}
                          {hymn.performedBy && (
                            <>
                              {' · '}
                              <span className="display-hymn-performer">
                                cantado por {hymn.performedBy}
                              </span>
                            </>
                          )}
                        </p>
                        {hymn.addedBy?.name && (
                          <p className="display-item-author">
                            Adicionado por {hymn.addedBy.name}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      )}
    </DisplayPanel>
  );
}
