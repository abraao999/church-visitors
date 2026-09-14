import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi } from './adminApi';
import { formatAdminDateTime } from './adminFormat';
import type { PlatformActivityList, PlatformAuditOperation } from './adminTypes';

const OPERATION_LABELS: Record<PlatformAuditOperation, string> = {
  login_succeeded: 'Entrada no painel',
  login_blocked: 'Entrada bloqueada',
  logout: 'Saída do painel',
  church_assisted_created: 'Igreja cadastrada',
  church_suspended: 'Igreja suspensa',
  church_reactivated: 'Igreja reativada',
  verification_resent: 'Confirmação reenviada',
  password_reset_requested: 'Redefinição enviada',
  admin_changed: 'Administrador alterado',
};

export function AdminActivitiesPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const operation = params.get('operation') || '';
  const pageParam = Number(params.get('page') || '1');
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const [draft, setDraft] = useState(q);
  const [data, setData] = useState<PlatformActivityList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const query = useMemo(() => ({ q, operation, page }), [q, operation, page]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    adminApi.activities(query)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível carregar as atividades.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query]);

  function updateParams(next: { q?: string; operation?: string; page?: number }) {
    const search = new URLSearchParams();
    const nextQ = next.q ?? q;
    const nextOperation = next.operation ?? operation;
    const nextPage = next.page ?? 1;
    if (nextQ) search.set('q', nextQ);
    if (nextOperation) search.set('operation', nextOperation);
    if (nextPage > 1) search.set('page', String(nextPage));
    setParams(search);
  }

  return (
    <div>
      <div className="admin-page-heading">
        <div>
          <h1>Atividades</h1>
          <p>Histórico das ações realizadas na administração da plataforma.</p>
        </div>
        {data && <span className="admin-badge">{data.total} registro{data.total === 1 ? '' : 's'}</span>}
      </div>

      <form className="admin-filters" onSubmit={(event) => { event.preventDefault(); updateParams({ q: draft }); }}>
        <label>
          Buscar administrador ou igreja
          <input type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Digite para buscar" />
        </label>
        <label>
          Tipo de atividade
          <select value={operation} onChange={(event) => updateParams({ operation: event.target.value })}>
            <option value="">Todas</option>
            {Object.entries(OPERATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </form>

      {loading && <p className="admin-boot">Carregando atividades...</p>}
      {error && <p className="card admin-error" role="alert">{error}</p>}
      {!loading && !error && data?.items.length === 0 && <p className="card admin-empty">Nenhuma atividade encontrada para este filtro.</p>}
      {!loading && !error && data && data.items.length > 0 && (
        <>
          <div className="card admin-activity-list">
            {data.items.map((item) => (
              <article key={item.id} className="admin-activity-row">
                <span className={`admin-activity-icon is-${item.operation}`} aria-hidden="true" />
                <div className="admin-activity-copy">
                  <strong>{OPERATION_LABELS[item.operation]}</strong>
                  <span>
                    {item.adminName}
                    {item.churchName ? ' · ' : ''}
                    {item.churchName && item.churchId ? <Link to={`/admin/igrejas/${item.churchId}`}>{item.churchName}</Link> : item.churchName}
                  </span>
                  {item.reason && <small>Motivo: {item.reason}</small>}
                </div>
                <time dateTime={item.createdAt}>{formatAdminDateTime(item.createdAt)}</time>
              </article>
            ))}
          </div>
          <div className="admin-actions admin-pagination">
            <button type="button" className="btn" disabled={data.page <= 1} onClick={() => updateParams({ page: data.page - 1 })}>Página anterior</button>
            <span>Página {data.page} de {data.totalPages}</span>
            <button type="button" className="btn" disabled={data.page >= data.totalPages} onClick={() => updateParams({ page: data.page + 1 })}>Próxima página</button>
          </div>
        </>
      )}
    </div>
  );
}
