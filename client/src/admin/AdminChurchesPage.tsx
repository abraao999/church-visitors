import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAdminAuth } from './AdminAuthContext';
import { adminApi } from './adminApi';
import { canSupportChurches, formatAdminDateTime } from './adminFormat';
import { SITUATION_LABELS, type PlatformChurchList } from './adminTypes';

export function AdminChurchesPage() {
  const { admin } = useAdminAuth();
  const titleId = useId();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const situacao = params.get('situacao') || '';
  const page = Number(params.get('page') || '1');
  const [draft, setDraft] = useState(q);
  const [data, setData] = useState<PlatformChurchList | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createStatus, setCreateStatus] = useState('');
  const [form, setForm] = useState({ churchName: '', ownerName: '', ownerEmail: '', city: '' });

  const query = useMemo(() => ({ q, situacao, page: Number.isInteger(page) && page > 0 ? page : 1 }), [q, situacao, page]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    adminApi
      .churches(query)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível carregar as igrejas.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  function updateParams(next: { q?: string; situacao?: string; page?: number }) {
    const search = new URLSearchParams();
    const nextQ = next.q ?? q;
    const nextSituacao = next.situacao ?? situacao;
    const nextPage = next.page ?? 1;
    if (nextQ) search.set('q', nextQ);
    if (nextSituacao) search.set('situacao', nextSituacao);
    if (nextPage > 1) search.set('page', String(nextPage));
    setParams(search);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreateError('');
    setCreateStatus('');
    setCreating(true);
    try {
      const result = await adminApi.createChurch(form);
      setCreateStatus(`Enviamos a confirmação para ${result.emailMasked}. O proprietário cria a própria senha.`);
      setForm({ churchName: '', ownerName: '', ownerEmail: '', city: '' });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Não foi possível cadastrar a igreja.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="admin-page-heading">
        <div>
          <h1>Igrejas</h1>
          <p>Gerencie as organizações cadastradas na plataforma.</p>
        </div>
        {canSupportChurches(admin?.role) && (
          <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
            Cadastrar igreja
          </button>
        )}
      </div>

      <form
        className="admin-filters"
        onSubmit={(event) => {
          event.preventDefault();
          updateParams({ q: draft, page: 1 });
        }}
      >
        <label>
          Buscar igreja, responsável ou e-mail
          <input
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Digite para buscar"
          />
        </label>
        <label>
          Situação
          <select
            value={situacao}
            onChange={(event) => updateParams({ situacao: event.target.value, page: 1 })}
          >
            <option value="">Todas</option>
            <option value="ativa">Ativas</option>
            <option value="pendente">Pendentes</option>
            <option value="suspensa">Suspensas</option>
          </select>
        </label>
      </form>

      {loading && <p className="admin-boot">Carregando igrejas...</p>}
      {error && <p className="card admin-error" role="alert">{error}</p>}
      {!loading && !error && data && data.items.length === 0 && (
        <p className="card admin-empty">Nenhuma igreja encontrada para este filtro.</p>
      )}
      {!loading && !error && data && data.items.length > 0 && (
        <>
          <div className="card admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Igreja</th>
                  <th>Proprietário</th>
                  <th>Situação</th>
                  <th>Membros</th>
                  <th>Último acesso</th>
                  <th>Cadastro</th>
                  <th><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                      {row.city ? <span>{row.city}</span> : null}
                    </td>
                    <td>
                      <strong>{row.ownerName || '—'}</strong>
                      <span>{row.ownerEmail || 'sem e-mail'}</span>
                    </td>
                    <td>
                      <span className="admin-status">
                        <span className={`admin-status-dot is-${row.situation}`} />
                        {SITUATION_LABELS[row.situation]}
                      </span>
                    </td>
                    <td>{row.memberCount}</td>
                    <td>{formatAdminDateTime(row.lastSeenAt)}</td>
                    <td>{formatAdminDateTime(row.createdAt)}</td>
                    <td>
                      <Link className="btn" to={`/admin/igrejas/${row.id}`}>
                        Ver igreja
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-actions">
            <button
              type="button"
              className="btn"
              disabled={data.page <= 1}
              onClick={() => updateParams({ page: data.page - 1 })}
            >
              Página anterior
            </button>
            <span>
              Página {data.page} de {data.totalPages}
            </span>
            <button
              type="button"
              className="btn"
              disabled={data.page >= data.totalPages}
              onClick={() => updateParams({ page: data.page + 1 })}
            >
              Próxima página
            </button>
          </div>
        </>
      )}

      {modalOpen && (
        <div className="admin-dialog-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
          <form
            className="card admin-dialog"
            role="dialog"
            aria-labelledby={titleId}
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleCreate}
          >
            <h2 id={titleId}>Cadastrar igreja</h2>
            <p>O proprietário recebe o e-mail de confirmação e cria a própria senha.</p>
            {createError && <p className="error-message" role="alert">{createError}</p>}
            {createStatus && <p className="admin-boot" role="status">{createStatus}</p>}
            <div className="form-group">
              <label htmlFor="assisted-church">Nome da igreja</label>
              <input
                id="assisted-church"
                value={form.churchName}
                onChange={(event) => setForm((current) => ({ ...current, churchName: event.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="assisted-owner">Nome do proprietário</label>
              <input
                id="assisted-owner"
                value={form.ownerName}
                onChange={(event) => setForm((current) => ({ ...current, ownerName: event.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="assisted-email">E-mail do proprietário</label>
              <input
                id="assisted-email"
                type="email"
                value={form.ownerEmail}
                onChange={(event) => setForm((current) => ({ ...current, ownerEmail: event.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="assisted-city">Cidade (opcional)</label>
              <input
                id="assisted-city"
                value={form.city}
                onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
              />
            </div>
            <div className="admin-actions">
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Enviando...' : 'Enviar confirmação'}
              </button>
              <button type="button" className="btn" onClick={() => setModalOpen(false)}>
                Fechar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
