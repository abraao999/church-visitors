import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { RetentionOverview, RetentionPolicy, RetentionSummary } from '../types';
import { AppIcon } from './AppIcon';
import './RetentionPolicySection.css';

type EditablePolicy = Pick<
  RetentionPolicy,
  | 'enabled'
  | 'visitorsMonths'
  | 'prayersDays'
  | 'vehicleNoticesDays'
  | 'guestAccessesDays'
  | 'teamInvitationsDays'
  | 'portariaDevicesDays'
>;

const MONTH_OPTIONS = [12, 24, 36, 60];
const DAY_OPTIONS = [30, 60, 90, 180, 365];
const DEVICE_OPTIONS = [90, 180, 365, 730];

const PREVIEW_ROWS: Array<{
  count: keyof RetentionSummary;
  cutoff: keyof RetentionOverview['preview']['cutoffs'];
  label: string;
  action: string;
}> = [
  { count: 'visitorsAnonymized', cutoff: 'visitors', label: 'Visitantes', action: 'anonimizar' },
  { count: 'prayersDeleted', cutoff: 'prayers', label: 'Pedidos de oração', action: 'excluir' },
  { count: 'vehicleNoticesDeleted', cutoff: 'vehicleNotices', label: 'Avisos de veículos', action: 'excluir' },
  { count: 'guestAccessesDeleted', cutoff: 'guestAccesses', label: 'Acessos vencidos', action: 'excluir' },
  { count: 'teamInvitationsDeleted', cutoff: 'teamInvitations', label: 'Convites vencidos', action: 'excluir' },
  { count: 'portariaDevicesDeleted', cutoff: 'portariaDevices', label: 'Dispositivos revogados', action: 'excluir' },
];

function editable(policy: RetentionPolicy): EditablePolicy {
  return {
    enabled: policy.enabled,
    visitorsMonths: policy.visitorsMonths,
    prayersDays: policy.prayersDays,
    vehicleNoticesDays: policy.vehicleNoticesDays,
    guestAccessesDays: policy.guestAccessesDays,
    teamInvitationsDays: policy.teamInvitationsDays,
    portariaDevicesDays: policy.portariaDevicesDays,
  };
}

function dateLabel(value?: string) {
  if (!value) return 'Ainda não executada';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cutoffLabel(value: string) {
  return new Date(value).toLocaleDateString('pt-BR');
}

function total(summary: RetentionSummary) {
  return Object.values(summary).reduce((sum, value) => sum + value, 0);
}

export function RetentionPolicySection() {
  const [overview, setOverview] = useState<RetentionOverview | null>(null);
  const [form, setForm] = useState<EditablePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api.getRetentionOverview()
      .then((data) => {
        setOverview(data);
        setForm(editable(data.policy));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar a retenção.');
      })
      .finally(() => setLoading(false));
  }, []);

  const pendingTotal = useMemo(
    () => (overview ? total(overview.preview.counts) : 0),
    [overview]
  );

  function changeNumber(key: keyof EditablePolicy, value: string) {
    setForm((current) => current ? { ...current, [key]: Number(value) } : current);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!form || !overview) return;

    const activating = form.enabled && !overview.policy.enabled;
    if (
      activating &&
      !window.confirm(
        'Ativar a retenção automática? Registros vencidos serão anonimizados ou excluídos diariamente de acordo com estes prazos.'
      )
    ) return;

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const data = await api.saveRetentionPolicy(form, activating);
      setOverview(data);
      setForm(editable(data.policy));
      setSuccess(data.policy.enabled ? 'Política salva e ativada.' : 'Política salva. A limpeza está desativada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a política.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    if (!overview?.policy.enabled || pendingTotal === 0) return;
    if (
      !window.confirm(
        `Executar agora? ${pendingTotal} registro${pendingTotal === 1 ? '' : 's'} será${pendingTotal === 1 ? '' : 'ão'} anonimizado${pendingTotal === 1 ? '' : 's'} ou excluído${pendingTotal === 1 ? '' : 's'}. Esta ação não pode ser desfeita.`
      )
    ) return;

    setRunning(true);
    setError('');
    setSuccess('');
    try {
      const result = await api.runRetentionNow();
      setOverview(result.overview);
      setForm(editable(result.overview.policy));
      setSuccess(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível executar a limpeza.');
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return <section className="card retention-section"><p className="empty-state">Carregando política de retenção...</p></section>;
  }
  if (!form || !overview) {
    return <section className="card retention-section"><p className="error-message">{error || 'Política indisponível.'}</p></section>;
  }

  return (
    <section className="card retention-section" aria-labelledby="retention-title">
      <div className="church-settings-form-heading">
        <span><AppIcon name="shield" /></span>
        <div>
          <div className="retention-title-row">
            <h2 id="retention-title">Privacidade e retenção</h2>
            <span className={`retention-status ${overview.policy.enabled ? 'active' : ''}`}>
              {overview.policy.enabled ? 'Ativa' : 'Desativada'}
            </span>
          </div>
          <p>Defina quando dados antigos deixam de ser necessários para esta igreja.</p>
        </div>
      </div>

      <div className="retention-notice">
        <AppIcon name="info" />
        <p>
          Visitantes vencidos perdem nome e origem, mas continuam nas contagens dos cultos.
          Pedidos de oração e demais registros vencidos são excluídos definitivamente.
        </p>
      </div>

      <div className="church-settings-feedback" aria-live="polite">
        {error && <p className="error-message" role="alert">{error}</p>}
        {success && <p className="success-message"><AppIcon name="check" />{success}</p>}
      </div>

      <form onSubmit={handleSave}>
        <label className="retention-toggle">
          <span>
            <strong>Limpeza automática diária</strong>
            <small>Nada será removido enquanto esta opção estiver desativada.</small>
          </span>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => setForm((current) => current ? { ...current, enabled: event.target.checked } : current)}
          />
        </label>

        <div className="retention-fields">
          <label>
            <span>Visitantes</span>
            <small>Anonimizar após a visita</small>
            <select value={form.visitorsMonths} onChange={(e) => changeNumber('visitorsMonths', e.target.value)}>
              {MONTH_OPTIONS.map((value) => <option key={value} value={value}>{value} meses</option>)}
            </select>
          </label>
          <label>
            <span>Pedidos de oração</span>
            <small>Excluir depois de</small>
            <select value={form.prayersDays} onChange={(e) => changeNumber('prayersDays', e.target.value)}>
              {DAY_OPTIONS.map((value) => <option key={value} value={value}>{value} dias</option>)}
            </select>
          </label>
          <label>
            <span>Avisos de veículos resolvidos</span>
            <small>Excluir depois de</small>
            <select value={form.vehicleNoticesDays} onChange={(e) => changeNumber('vehicleNoticesDays', e.target.value)}>
              {DAY_OPTIONS.map((value) => <option key={value} value={value}>{value} dias</option>)}
            </select>
          </label>
          <label>
            <span>Acessos vencidos ou desativados</span>
            <small>Excluir depois de</small>
            <select value={form.guestAccessesDays} onChange={(e) => changeNumber('guestAccessesDays', e.target.value)}>
              {DAY_OPTIONS.map((value) => <option key={value} value={value}>{value} dias</option>)}
            </select>
          </label>
          <label>
            <span>Convites vencidos ou encerrados</span>
            <small>Excluir depois de</small>
            <select value={form.teamInvitationsDays} onChange={(e) => changeNumber('teamInvitationsDays', e.target.value)}>
              {DAY_OPTIONS.map((value) => <option key={value} value={value}>{value} dias</option>)}
            </select>
          </label>
          <label>
            <span>Dispositivos revogados</span>
            <small>Excluir depois de</small>
            <select value={form.portariaDevicesDays} onChange={(e) => changeNumber('portariaDevicesDays', e.target.value)}>
              {DEVICE_OPTIONS.map((value) => <option key={value} value={value}>{value} dias</option>)}
            </select>
          </label>
        </div>

        <div className="church-settings-actions">
          <button type="submit" className="btn btn-primary" disabled={saving || running}>
            {saving ? 'Salvando...' : 'Salvar política'}
          </button>
        </div>
      </form>

      <div className="retention-preview">
        <div className="retention-preview-heading">
          <div>
            <h3>Prévia da próxima limpeza</h3>
            <p>{pendingTotal === 0 ? 'Nenhum registro vencido neste momento.' : `${pendingTotal} registros serão tratados.`}</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleRunNow}
            disabled={!overview.policy.enabled || pendingTotal === 0 || running || saving}
          >
            <AppIcon name="trash" /> {running ? 'Executando...' : 'Executar agora'}
          </button>
        </div>
        <ul>
          {PREVIEW_ROWS.map((row) => (
            <li key={row.count}>
              <span><strong>{row.label}</strong><small>Anteriores a {cutoffLabel(overview.preview.cutoffs[row.cutoff])}</small></span>
              <span>{overview.preview.counts[row.count]} para {row.action}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="retention-history">
        <h3>Últimas execuções</h3>
        {overview.history.length === 0 ? (
          <p className="empty-state">A limpeza ainda não foi executada.</p>
        ) : (
          <ul>
            {overview.history.slice(0, 5).map((run) => (
              <li key={run.id}>
                <span>
                  <strong>{run.trigger === 'automatic' ? 'Limpeza automática' : 'Executada pelo proprietário'}</strong>
                  <small>{dateLabel(run.completedAt)}</small>
                </span>
                <span className={`retention-run-status ${run.status}`}>{run.status === 'completed' ? `${total(run.summary)} tratados` : 'Falhou'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="retention-last-run">Última verificação: {dateLabel(overview.policy.lastRunAt)}</p>
    </section>
  );
}
