import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { DisplayPanel } from '../../components/DisplayPanel';
import type { Visitor } from '../../types';
import { RELATIONSHIP_LABELS } from '../../types';
import { todayLocalISO } from '../../utils/date';

export function VisitorsPanelPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getVisitors(todayLocalISO());
      setVisitors(data);
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

  return (
    <DisplayPanel
      title="Visitantes"
      subtitle="Pessoas que chegaram hoje"
      count={visitors.length}
      loading={loading}
    >
      {visitors.length === 0 ? (
        <p className="display-empty">Nenhum visitante registrado ainda.</p>
      ) : (
        <ul className="display-list">
          {visitors.map((visitor) => (
            <li key={visitor._id} className="display-item">
              <h2 className="display-item-title">{visitor.name}</h2>
              <p className="display-item-meta">
                {RELATIONSHIP_LABELS[visitor.relationship] ?? visitor.relationship}
                {visitor.city ? ` · ${visitor.city}` : ''}
              </p>
              {visitor.createdBy?.name && (
                <p className="display-item-author">Registrado por {visitor.createdBy.name}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </DisplayPanel>
  );
}
