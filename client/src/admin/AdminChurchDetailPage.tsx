import { useCallback, useEffect, useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAdminAuth } from './AdminAuthContext';
import { adminApi } from './adminApi';
import { canManageChurches, canSupportChurches, formatAdminDate, formatAdminDateTime } from './adminFormat';
import { SITUATION_LABELS, type PlatformChurchDetail } from './adminTypes';

export function AdminChurchDetailPage() {
  const { churchId = '' } = useParams();
  const { admin } = useAdminAuth();
  const titleId = useId();
  const [data, setData] = useState<PlatformChurchDetail | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmName, setConfirmName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await adminApi.church(churchId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a igreja.');
    } finally {
      setLoading(false);
    }
  }, [churchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: string, work: () => Promise<void>, ok: string) {
    setBusy(action);
    setError('');
    setStatus('');
    try {
      await work();
      setStatus(ok);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação.');
    } finally {
      setBusy('');
    }
  }

  if (loading) return <p className="admin-boot">Carregando igreja...</p>;
  if (error && !data) return <p className="card admin-error" role="alert">{error}</p>;
  if (!data) return <p className="card admin-empty">Igreja não encontrada.</p>;

  return (
    <div>
      <Link className="btn admin-ghost" to="/admin/igrejas">
        Voltar para igrejas
      </Link>
      <div className="admin-church-heading">
        <div>
          <h1>{data.name}</h1>
          <p>{data.city || 'Cidade ainda não informada'}</p>
        </div>
        <span className="admin-status admin-badge">
          <span className={`admin-status-dot is-${data.situation}`} />
          Igreja {SITUATION_LABELS[data.situation].toLowerCase()}
        </span>
      </div>

      {error && <p className="error-message" role="alert">{error}</p>}
      {status && <p className="admin-boot" role="status">{status}</p>}
      {admin?.role === 'viewer' && (
        <p className="admin-boot" role="status">
          Seu papel permite somente consulta. Ações sem permissão ficam ocultas.
        </p>
      )}

      <div className="admin-detail-grid">
        <section className="admin-section">
          <h2>Informações da conta</h2>
          <p>Dados administrativos, sem conteúdo privado da igreja.</p>
          <div className="admin-detail-row">
            <span>Proprietário</span>
            <strong>{data.owner?.name || 'Não encontrado'}</strong>
          </div>
          <div className="admin-detail-row">
            <span>E-mail</span>
            <div>
              <strong>{data.owner?.email || '—'}</strong>
              <span>{data.owner?.emailVerified ? 'Verificado' : 'Ainda não confirmado'}</span>
            </div>
          </div>
          <div className="admin-detail-row">
            <span>Criada em</span>
            <strong>{formatAdminDate(data.createdAt)}</strong>
          </div>
          <div className="admin-detail-row">
            <span>Último acesso</span>
            <strong>{formatAdminDateTime(data.lastSeenAt)}</strong>
          </div>
          <div className="admin-actions">
            {canSupportChurches(admin?.role) && !data.owner?.emailVerified && (
              <button
                type="button"
                className="btn"
                disabled={busy === 'verify'}
                onClick={() => void run('verify', () => adminApi.resendVerification(data.id), 'Confirmação reenviada.')}
              >
                Reenviar confirmação
              </button>
            )}
            {canSupportChurches(admin?.role) && (
              <button type="button" className="btn" onClick={() => setResetOpen(true)}>
                Redefinir acesso
              </button>
            )}
            {canManageChurches(admin?.role) && data.situation !== 'suspensa' && (
              <button type="button" className="btn" style={{ color: 'var(--danger)' }} onClick={() => setSuspendOpen(true)}>
                Suspender igreja
              </button>
            )}
            {canManageChurches(admin?.role) && data.situation === 'suspensa' && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy === 'reactivate'}
                onClick={() => void run('reactivate', () => adminApi.reactivateChurch(data.id), 'Igreja reativada. Os usuários precisam entrar de novo.')}
              >
                Reativar igreja
              </button>
            )}
          </div>
        </section>
        <section className="admin-section">
          <h2>Uso do sistema</h2>
          <p>Somente números consolidados.</p>
          <div className="admin-detail-row"><span>Membros ativos</span><strong>{data.memberCount}</strong></div>
          <div className="admin-detail-row"><span>Visitantes registrados</span><strong>{data.visitorCount}</strong></div>
          <div className="admin-detail-row"><span>Cultos cadastrados</span><strong>{data.serviceCount}</strong></div>
          <div className="admin-detail-row"><span>Acessos públicos ativos</span><strong>{data.publicAccessCount}</strong></div>
          <div className="admin-detail-row"><span>Dispositivos da portaria</span><strong>{data.deviceCount}</strong></div>
          <h2 style={{ marginTop: '1.2rem' }}>Recursos habilitados</h2>
          {data.resources.map((item) => (
            <div key={item.key} className="admin-resource">
              <span>{item.enabled ? 'Ativo' : 'Não configurado'}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </section>
      </div>

      {resetOpen && (
        <div className="admin-dialog-backdrop" role="presentation" onClick={() => setResetOpen(false)}>
          <div className="card admin-dialog" role="dialog" aria-labelledby={`${titleId}-reset`} aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2 id={`${titleId}-reset`}>Redefinir acesso</h2>
            <p>Vamos enviar o e-mail normal de redefinição de senha ao proprietário. A senha atual não muda agora.</p>
            <div className="admin-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy === 'reset'}
                onClick={() => {
                  setResetOpen(false);
                  void run('reset', () => adminApi.sendPasswordReset(data.id), 'E-mail de redefinição enviado.');
                }}
              >
                Enviar e-mail
              </button>
              <button type="button" className="btn" onClick={() => setResetOpen(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {suspendOpen && (
        <div className="admin-dialog-backdrop" role="presentation" onClick={() => setSuspendOpen(false)}>
          <form
            className="card admin-dialog"
            role="dialog"
            aria-labelledby={`${titleId}-suspend`}
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              setSuspendOpen(false);
              void run('suspend', () => adminApi.suspendChurch(data.id, reason, confirmName), 'Igreja suspensa.');
            }}
          >
            <h2 id={`${titleId}-suspend`}>Suspender igreja</h2>
            <p>Os dados são preservados. A equipe, os formulários públicos, as TVs e a portaria perdem o acesso.</p>
            <div className="form-group">
              <label htmlFor="suspend-reason">Motivo</label>
              <textarea
                id="suspend-reason"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="suspend-name">Digite o nome da igreja para confirmar</label>
              <input
                id="suspend-name"
                required
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
              />
            </div>
            <div className="admin-actions">
              <button type="submit" className="btn btn-primary" disabled={busy === 'suspend'}>
                Suspender
              </button>
              <button type="button" className="btn" onClick={() => setSuspendOpen(false)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
