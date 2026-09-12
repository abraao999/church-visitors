import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from './adminApi';
import type { PlatformOverview } from './adminTypes';

export function AdminOverviewPage() {
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .overview()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível carregar a visão geral.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="admin-boot">Carregando visão geral...</p>;
  if (error) return <p className="card admin-error" role="alert">{error}</p>;
  if (!data) return <p className="card admin-empty">Não há dados disponíveis no momento.</p>;

  return (
    <div>
      <div className="admin-page-heading">
        <div>
          <h1>Visão geral</h1>
          <p>Acompanhe a operação da Eclesiafy.</p>
        </div>
        <span className="admin-badge">Dados reais do banco</span>
      </div>

      <div className="admin-stats">
        <article className="card admin-stat">
          <span>Igrejas cadastradas</span>
          <strong>{data.churchesTotal}</strong>
          <small>{data.churchesThisMonth} novas neste mês</small>
        </article>
        <article className="card admin-stat">
          <span>Igrejas ativas</span>
          <strong>{data.churchesActive}</strong>
          <small>{data.churchesSuspended} suspensas · {data.churchesPending} pendentes</small>
        </article>
        <article className="card admin-stat">
          <span>Usuários ativos</span>
          <strong>{data.usersActive}</strong>
          <small>{data.usersSeenToday} acessaram hoje</small>
        </article>
      </div>

      <div className="admin-overview-grid">
        <section className="admin-section">
          <h2>Pendências</h2>
          <p>Itens que precisam de atenção.</p>
          {data.pendingItems.length === 0 ? (
            <p className="card admin-empty">Nenhuma pendência registrada.</p>
          ) : (
            <div>
              {data.pendingItems.map((item) => (
                <div key={item.key} className="admin-pending-row">
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <Link className="btn" to={item.href}>
                    {item.actionLabel}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="admin-section">
          <h2>Uso dos recursos</h2>
          <p>Percentual de igrejas que utilizaram cada área.</p>
          {data.usage.map((item) => (
            <div key={item.key} className="admin-usage-row">
              <div style={{ flex: 1 }}>
                <span>{item.label}</span>
                <div className="admin-usage-bar" aria-hidden="true">
                  <div className="admin-usage-fill" style={{ width: `${item.percent}%` }} />
                </div>
              </div>
              <strong>{item.percent}%</strong>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
