import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { VisitorForm } from '../components/VisitorForm';
import { VisitorList } from '../components/VisitorList';
import type { Visitor } from '../types';

export function VisitorsPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);

  const loadVisitors = useCallback(async () => {
    try {
      const data = await api.getVisitors();
      setVisitors(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVisitors();
  }, [loadVisitors]);

  async function handleDelete(id: string) {
    if (!confirm('Remover este visitante?')) return;
    await api.deleteVisitor(id);
    loadVisitors();
  }

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Visitantes</h1>
      <div className="grid-2">
        <VisitorForm onSuccess={loadVisitors} />
        {loading ? (
          <div className="card">
            <p className="empty-state">Carregando...</p>
          </div>
        ) : (
          <VisitorList visitors={visitors} onDelete={handleDelete} />
        )}
      </div>
    </div>
  );
}
