import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { TrainingOverview, TrainingSeedKind } from '../types';
import { hasPermission } from '../utils/permissions';
import { AppIcon } from './AppIcon';
import './TrainingModeSection.css';

const seedActions: Array<{
  kind: TrainingSeedKind;
  title: string;
  description: string;
  icon: 'users' | 'prayer' | 'car' | 'calendar';
}> = [
  {
    kind: 'visitors',
    title: 'Visitantes de exemplo',
    description: 'Cria pessoas e um acompanhamento para treinar a portaria.',
    icon: 'users',
  },
  {
    kind: 'prayers',
    title: 'Pedidos de oração',
    description: 'Cria pedidos aprovados e privados para testar os fluxos.',
    icon: 'prayer',
  },
  {
    kind: 'vehicle',
    title: 'Aviso de veículo',
    description: 'Cria um aviso pendente para testar alertas e painel.',
    icon: 'car',
  },
  {
    kind: 'service',
    title: 'Culto de treinamento',
    description: 'Cria um culto aberto com louvores fictícios.',
    icon: 'calendar',
  },
];

function total(summary?: TrainingOverview['summary']) {
  return summary?.total ?? 0;
}

export function TrainingModeSection() {
  const { user, refreshUser } = useAuth();
  const canUpdate = hasPermission(user?.permissions, 'church:update') || user?.role === 'owner';
  const [overview, setOverview] = useState<TrainingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api
      .getTrainingOverview()
      .then(setOverview)
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar o treinamento.'))
      .finally(() => setLoading(false));
  }, []);

  const summaryItems = useMemo(() => {
    const summary = overview?.summary;
    return [
      ['Visitantes', summary?.visitors ?? 0],
      ['Pedidos', summary?.prayers ?? 0],
      ['Avisos', summary?.vehicleNotices ?? 0],
      ['Cultos', summary?.services ?? 0],
      ['Acompanhamentos', summary?.followUps ?? 0],
    ];
  }, [overview]);

  async function toggleTraining(next: boolean) {
    if (!canUpdate) return;
    setBusy('toggle');
    setError('');
    setSuccess('');
    try {
      const nextOverview = await api.setTrainingMode(next);
      setOverview(nextOverview);
      await refreshUser();
      setSuccess(next ? 'Modo treinamento ativado.' : 'Modo treinamento desativado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar o modo treinamento.');
    } finally {
      setBusy('');
    }
  }

  async function seed(kind: TrainingSeedKind) {
    if (!canUpdate || !overview?.enabled) return;
    setBusy(kind);
    setError('');
    setSuccess('');
    try {
      const nextOverview = await api.seedTrainingData(kind);
      setOverview(nextOverview);
      setSuccess('Dados de treinamento criados. Eles aparecem com o selo TESTE.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar os exemplos.');
    } finally {
      setBusy('');
    }
  }

  async function clear() {
    if (!canUpdate || !overview || total(overview.summary) === 0) return;
    const ok = window.confirm('Apagar todos os dados de treinamento desta igreja? Os dados reais serão preservados.');
    if (!ok) return;
    setBusy('clear');
    setError('');
    setSuccess('');
    try {
      const nextOverview = await api.clearTrainingData();
      setOverview(nextOverview);
      setSuccess('Dados de treinamento removidos.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível limpar os dados de treinamento.');
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return <section className="card training-section"><p className="empty-state">Carregando treinamento...</p></section>;
  }

  return (
    <section className="card church-settings-form training-section" aria-labelledby="training-title">
      <div className="church-settings-form-heading">
        <span>
          <AppIcon name="shield" />
        </span>
        <div>
          <div className="training-title-row">
            <h2 id="training-title">Modo treinamento</h2>
            <span className={`retention-status ${overview?.enabled ? 'active' : ''}`}>
              {overview?.enabled ? 'Ativado' : 'Desativado'}
            </span>
          </div>
          <p>Use dados fictícios para treinar a equipe sem misturar com os relatórios reais.</p>
        </div>
      </div>

      <div className="church-settings-feedback" aria-live="polite">
        {error && <p className="error-message" role="alert">{error}</p>}
        {success && (
          <p className="success-message">
            <AppIcon name="check" />
            {success}
          </p>
        )}
      </div>

      <div className="retention-notice">
        <AppIcon name="info" />
        <span>
          Quando ativo, novos cadastros feitos nas telas internas entram como teste. Use o botão de limpeza para remover
          tudo que foi criado no treinamento desta igreja.
        </span>
      </div>

      <label className="retention-toggle">
        <span>
          <strong>Ativar modo treinamento</strong>
          <small>Exibe aviso global e marca os próximos registros como TESTE.</small>
        </span>
        <input
          type="checkbox"
          checked={overview?.enabled === true}
          disabled={!canUpdate || busy === 'toggle'}
          onChange={(event) => void toggleTraining(event.target.checked)}
        />
      </label>

      <div className="training-seed-grid">
        {seedActions.map((action) => (
          <button
            key={action.kind}
            type="button"
            className="training-seed-card"
            disabled={!canUpdate || !overview?.enabled || Boolean(busy)}
            onClick={() => void seed(action.kind)}
          >
            <span className="training-seed-icon">
              <AppIcon name={action.icon} />
            </span>
            <span>
              <strong>{busy === action.kind ? 'Criando...' : action.title}</strong>
              <small>{action.description}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="training-summary">
        <div className="training-summary-heading">
          <div>
            <h3>Dados de treinamento nesta igreja</h3>
            <p>{total(overview?.summary)} registros de teste encontrados.</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canUpdate || !overview || total(overview.summary) === 0 || Boolean(busy)}
            onClick={() => void clear()}
          >
            <AppIcon name="trash" />
            {busy === 'clear' ? 'Limpando...' : 'Limpar testes'}
          </button>
        </div>
        <ul>
          {summaryItems.map(([label, count]) => (
            <li key={label}>
              <span>{label}</span>
              <strong>{count}</strong>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
