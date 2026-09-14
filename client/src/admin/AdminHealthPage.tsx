import { useCallback, useEffect, useState } from 'react';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { adminApi } from './adminApi';
import { formatAdminDateTime } from './adminFormat';
import {
  HEALTH_OVERALL_LABELS,
  HEALTH_STATUS_LABELS,
  type PlatformHealth,
} from './adminTypes';
import './AdminHealthPage.css';

const SERVICE_ICONS: Record<PlatformHealth['services'][number]['key'], AppIconName> = {
  api: 'server',
  database: 'database',
  email: 'mail',
  storage: 'storage',
};

const OVERALL_HINT: Record<PlatformHealth['overall'], string> = {
  healthy: 'Os serviços necessários responderam nesta verificação.',
  warning: 'O acesso das igrejas continua disponível, mas há um ponto de atenção.',
  critical: 'Um serviço essencial não respondeu nesta verificação.',
  unknown: 'A verificação não pôde ser concluída por completo.',
};

function serviceMeta(service: PlatformHealth['services'][number]): string {
  if (typeof service.latencyMs === 'number') {
    return `Resposta em ${service.latencyMs} ms`;
  }
  if (service.key === 'email' && service.status === 'warning') {
    return 'Falhas recentes no envio, sem conteúdo das mensagens.';
  }
  if (service.key === 'email' && service.status === 'not_configured') {
    return 'O envio de e-mail ainda não foi configurado.';
  }
  if (service.key === 'storage' && service.status === 'not_configured') {
    return 'Vercel Blob ainda não foi configurado.';
  }
  if (service.key === 'storage' && service.status === 'healthy') {
    return 'Pronto para logotipos, sem teste de envio.';
  }
  if (service.key === 'api') {
    return 'Ambiente serverless, sem uptime contínuo.';
  }
  return service.message;
}

function jobStatusLabel(status: PlatformHealth['jobs'][number]['status']): string {
  if (status === 'completed') return 'Concluída';
  if (status === 'failed') return 'Falhou';
  if (status === 'running') return 'Em execução';
  return 'Nunca executada';
}

function formatDuration(ms?: number): string {
  if (typeof ms !== 'number') return 'Não informado';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

function deploymentValue(value?: string): string {
  return value || 'Não informado';
}

export function AdminHealthPage() {
  const [data, setData] = useState<PlatformHealth | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openIncident, setOpenIncident] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    if (refresh) setData(null);
    try {
      setData(await adminApi.health());
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Não foi possível consultar a saúde do sistema.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="admin-boot" aria-live="polite">Carregando saúde do sistema...</p>;
  }

  if (error && !data) {
    return (
      <div className="card admin-error" role="alert">
        <p>Não foi possível consultar a saúde do sistema.</p>
        <p>{error}</p>
        <button type="button" className="btn btn-primary" onClick={() => void load(true)}>
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) {
    return <p className="card admin-empty">Não foi possível consultar a saúde do sistema.</p>;
  }

  const retention = data.jobs[0];

  return (
    <div className="admin-health">
      <div className="admin-health-heading">
        <div className="admin-health-title">
          <span className="admin-health-title-icon" aria-hidden="true">
            <AppIcon name="activity" />
          </span>
          <div>
            <h1>Saúde do sistema</h1>
            <p>Acompanhe os serviços e as rotinas automáticas da Eclesiafy.</p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={refreshing}
          onClick={() => void load(true)}
        >
          <AppIcon name="refresh" />
          {refreshing ? 'Atualizando...' : 'Atualizar verificação'}
        </button>
      </div>

      <div className="admin-health-overall" role="status" aria-live="polite">
        <div className="admin-health-overall-copy">
          <span className={`admin-health-dot is-${data.overall}`} />
          <div>
            <strong>{HEALTH_OVERALL_LABELS[data.overall]}</strong>
            <span>{OVERALL_HINT[data.overall]}</span>
          </div>
        </div>
        <span>Verificado {formatAdminDateTime(data.checkedAt).toLowerCase()}</span>
      </div>

      <section aria-labelledby="health-services-heading">
        <div className="admin-health-section-heading">
          <div>
            <h2 id="health-services-heading">Serviços principais</h2>
            <p>Disponibilidade e tempo de resposta da última verificação.</p>
          </div>
        </div>
        <div className="admin-health-services">
          {data.services.map((service) => (
            <article key={service.key} className="card admin-health-service">
              <div className="admin-health-service-heading">
                <span className="admin-health-service-icon" aria-hidden="true">
                  <AppIcon name={SERVICE_ICONS[service.key]} />
                </span>
                <span className={`admin-health-badge is-${service.status}`}>
                  {HEALTH_STATUS_LABELS[service.status]}
                </span>
              </div>
              <h3>{service.label}</h3>
              <div className="admin-health-service-status">
                <span className={`admin-health-dot is-${service.status}`} />
                <strong>{service.message}</strong>
              </div>
              <p>{serviceMeta(service)}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="admin-health-detail">
        <section aria-labelledby="health-jobs-heading">
          <div className="admin-health-section-heading">
            <div>
              <h2 id="health-jobs-heading">Rotinas automáticas</h2>
              <p>Última execução e próxima programação.</p>
            </div>
          </div>
          {retention ? (
            <div className="admin-health-routine">
              <div>
                <strong>{retention.label}</strong>
                <span>{retention.scheduleLabel}</span>
              </div>
              <div>
                <span className="admin-health-service-status">
                  <span className={`admin-health-dot is-${retention.status === 'failed' ? 'critical' : retention.status === 'never_run' ? 'unknown' : 'healthy'}`} />
                  {jobStatusLabel(retention.status)}
                </span>
                <span>
                  {retention.status === 'never_run'
                    ? 'Nenhuma execução registrada até o momento.'
                    : formatAdminDateTime(retention.lastCompletedAt || retention.lastStartedAt)}
                </span>
              </div>
              <div>
                <span>Próxima execução</span>
                <span>{formatAdminDateTime(retention.nextRunAt)}</span>
              </div>
              {retention.summary && (
                <div className="admin-health-routine-summary">
                  <span>Duração: {formatDuration(retention.durationMs)}</span>
                  <span>Igrejas processadas: {retention.summary.churchesProcessed}</span>
                  <span>Falhas: {retention.summary.failures}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="card admin-empty">Nenhuma rotina automática registrada.</p>
          )}
        </section>

        <section aria-labelledby="health-incidents-heading">
          <div className="admin-health-section-heading">
            <div>
              <h2 id="health-incidents-heading">Incidentes recentes</h2>
              <p>Somente falhas técnicas, sem dados das igrejas.</p>
            </div>
            <span className="admin-health-badge is-unknown">{data.incidents.length} registro{data.incidents.length === 1 ? '' : 's'}</span>
          </div>
          {data.incidents.length === 0 ? (
            <p className="card admin-empty">Nenhum incidente técnico recente.</p>
          ) : (
            <div>
              {data.incidents.map((incident) => {
                const open = openIncident === incident.id;
                return (
                  <div key={incident.id} className="admin-health-incident">
                    <div className="admin-health-incident-main">
                      <div className="admin-health-incident-copy">
                        <span className={`admin-health-dot is-${incident.severity}`} />
                        <div>
                          <strong>{incident.title}</strong>
                          <span>
                            {formatAdminDateTime(incident.createdAt)} · {incident.source}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn admin-ghost"
                        aria-expanded={open}
                        onClick={() => setOpenIncident(open ? '' : incident.id)}
                      >
                        {open ? 'Ocultar detalhes' : 'Ver detalhes'}
                      </button>
                    </div>
                    {open && <p className="admin-health-incident-detail">{incident.message}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="admin-health-deploy" aria-labelledby="health-deploy-heading">
        <h2 id="health-deploy-heading">Implantação</h2>
        <p>
          Ambiente: {deploymentValue(data.deployment.environment)} · Versão:{' '}
          {deploymentValue(data.deployment.version)} · Commit:{' '}
          {deploymentValue(data.deployment.commit)}
        </p>
      </section>

      <div className="admin-health-legend" aria-label="Legenda dos estados">
        <span><span className="admin-health-dot is-healthy" />Funcionando</span>
        <span><span className="admin-health-dot is-warning" />Precisa de atenção</span>
        <span><span className="admin-health-dot is-critical" />Indisponível</span>
        <span><span className="admin-health-dot is-not_configured" />Não configurado</span>
      </div>
    </div>
  );
}
