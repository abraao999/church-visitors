import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type ReportQuery } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import { ReportChart } from '../components/ReportChart';
import { useAuth } from '../auth/AuthContext';
import type {
  ReportAccesses,
  ReportOverview,
  ReportPrayers,
  ReportPreset,
  ReportService,
  ReportTab,
  ReportVehicles,
  ReportVisitors,
  Service,
} from '../types';
import { PRAYER_CARE_LABELS, REPORT_PRESETS } from '../types';
import { hasPermission } from '../utils/permissions';
import './ReportsPage.css';

const TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'visitors', label: 'Visitantes' },
  { id: 'prayers', label: 'Pedidos de oração' },
  { id: 'vehicles', label: 'Veículos' },
  { id: 'accesses', label: 'Acessos e QR Codes' },
  { id: 'service', label: 'Relatório por culto' },
];

const PRESET_LABELS: Record<ReportPreset, string> = {
  this_week: 'Esta semana',
  this_month: 'Este mês',
  last_3_months: 'Últimos 3 meses',
  last_6_months: 'Últimos 6 meses',
  this_year: 'Este ano',
  custom: 'Período personalizado',
};

function compareText(percent: number | null) {
  if (percent == null) return 'Sem comparação disponível';
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent}% comparado ao período anterior`;
}

function formatMs(value: number | null) {
  if (value == null) return 'Sem dados suficientes';
  const minutes = Math.round(value / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round((minutes / 60) * 10) / 10} h`;
}

const emptyFilters: ReportQuery = { preset: 'this_month', source: 'all' };

export function ReportsPage() {
  const { user } = useAuth();
  const canExport = hasPermission(user?.permissions, 'reports:export') || user?.role === 'owner';
  const canExportSensitive =
    hasPermission(user?.permissions, 'reports:export_sensitive') || user?.role === 'owner';
  const [tab, setTab] = useState<ReportTab>('overview');
  const [draft, setDraft] = useState<ReportQuery>(emptyFilters);
  const [applied, setApplied] = useState<ReportQuery>(emptyFilters);
  const [services, setServices] = useState<Service[]>([]);
  const [overview, setOverview] = useState<ReportOverview | null>(null);
  const [visitors, setVisitors] = useState<ReportVisitors | null>(null);
  const [prayers, setPrayers] = useState<ReportPrayers | null>(null);
  const [vehicles, setVehicles] = useState<ReportVehicles | null>(null);
  const [accesses, setAccesses] = useState<ReportAccesses | null>(null);
  const [serviceReport, setServiceReport] = useState<ReportService | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const query = useMemo(() => applied, [applied]);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const from = query.from || new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
      const periodServices = await api.getServices({
        from,
        to: query.to || today,
      }).catch(() => []);
      setServices(periodServices);
      if (tab === 'overview') setOverview(await api.getReportOverview(query));
      if (tab === 'visitors') setVisitors(await api.getReportVisitors(query));
      if (tab === 'prayers') setPrayers(await api.getReportPrayers(query));
      if (tab === 'vehicles') setVehicles(await api.getReportVehicles(query));
      if (tab === 'accesses') setAccesses(await api.getReportAccesses(query));
      if (tab === 'service') {
        if (!query.serviceId) {
          setServiceReport(null);
        } else {
          setServiceReport(await api.getReportService(query.serviceId, query));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os relatórios.');
    } finally {
      setLoading(false);
    }
  }, [query, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters() {
    if (draft.preset === 'custom' && (!draft.from || !draft.to)) {
      setError('Informe a data inicial e a data final.');
      return;
    }
    setApplied({ ...draft });
    setFiltersOpen(false);
  }

  function clearFilters() {
    setDraft(emptyFilters);
    setApplied(emptyFilters);
  }

  async function exportReport(format: 'pdf' | 'csv' | 'xlsx' | 'follow_up_list' | 'service', detailed = false) {
    setExporting(true);
    setExportMessage('');
    try {
      if ((format === 'follow_up_list' || (format === 'service' && detailed)) && !canExportSensitive) {
        throw new Error('Você não tem permissão para exportar dados pessoais.');
      }
      if (format !== 'follow_up_list' && !canExport) {
        throw new Error('Você não tem permissão para exportar relatórios.');
      }
      const result = await api.exportReport({
        ...query,
        format,
        detailed,
        serviceId: format === 'service' ? query.serviceId : query.serviceId,
      });
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      setExportMessage('Exportação concluída.');
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : 'Não foi possível exportar.');
    } finally {
      setExporting(false);
    }
  }

  const generated = overview?.generatedAt
    ? new Date(overview.generatedAt).toLocaleString('pt-BR')
    : '';

  return (
    <div className="reports-page">
      <section className="reports-hero">
        <div>
          <p className="reports-eyebrow">ANÁLISES DA IGREJA</p>
          <h1>Relatórios</h1>
          <p>Acompanhe os resultados e entenda melhor a rotina da igreja.</p>
        </div>
        <button type="button" className="btn btn-primary reports-export" onClick={() => setExportOpen(true)}>
          <AppIcon name="download" />
          Exportar relatório
        </button>
      </section>

      <div className="reports-tabs" role="tablist" aria-label="Áreas de relatório">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'active' : ''}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <label className="reports-tab-select">
        <span>Área</span>
        <select value={tab} onChange={(event) => setTab(event.target.value as ReportTab)}>
          {TABS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <section className={`reports-filters card${filtersOpen ? ' is-open' : ''}`}>
        <button type="button" className="reports-filters-toggle" onClick={() => setFiltersOpen((open) => !open)}>
          Filtros
          <AppIcon name="arrow" />
        </button>
        <div className="reports-filters-grid">
          <label>
            Período
            <select
              value={draft.preset}
              onChange={(event) => setDraft((current) => ({ ...current, preset: event.target.value as ReportPreset }))}
            >
              {REPORT_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {PRESET_LABELS[preset]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Data inicial
            <input
              type="date"
              value={draft.from || ''}
              disabled={draft.preset !== 'custom'}
              onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value, preset: 'custom' }))}
            />
          </label>
          <label>
            Data final
            <input
              type="date"
              value={draft.to || ''}
              disabled={draft.preset !== 'custom'}
              onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value, preset: 'custom' }))}
            />
          </label>
          <label>
            Culto
            <select
              value={draft.serviceId || ''}
              onChange={(event) => setDraft((current) => ({ ...current, serviceId: event.target.value || undefined }))}
            >
              <option value="">Todos os cultos</option>
              {services.map((service) => (
                <option key={service._id} value={service._id}>
                  {service.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Origem do registro
            <select
              value={draft.source || 'all'}
              onChange={(event) =>
                setDraft((current) => ({ ...current, source: event.target.value as ReportQuery['source'] }))
              }
            >
              <option value="all">Todas as origens</option>
              <option value="owner">Responsável</option>
              <option value="guest_access">Portal público</option>
              <option value="portaria_device">Portaria</option>
            </select>
          </label>
          <div className="reports-filter-actions">
            <button type="button" className="btn btn-primary" onClick={applyFilters}>
              Aplicar filtros
            </button>
            <button type="button" className="reports-clear" onClick={clearFilters}>
              Limpar
            </button>
          </div>
        </div>
      </section>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {loading && <p className="report-empty card">Carregando relatórios...</p>}

      {!loading && tab === 'overview' && overview && (
        <>
          <div className="reports-kpis">
            <article className="card">
              <AppIcon name="users" />
              <strong>{overview.cards.visitors.current}</strong>
              <span>Visitantes</span>
              <small>{compareText(overview.cards.visitors.percent)}</small>
            </article>
            <article className="card">
              <AppIcon name="calendar" />
              <strong>{overview.cards.averagePerService.current ?? '—'}</strong>
              <span>Média por culto</span>
              <small>
                {overview.cards.averagePerService.current == null
                  ? 'Sem dados suficientes'
                  : compareText(overview.cards.averagePerService.percent)}
              </small>
            </article>
            <article className="card">
              <AppIcon name="prayer" />
              <strong>{overview.cards.prayers.current}</strong>
              <span>Pedidos de oração</span>
              <small>{overview.cards.prayersFollowed} acompanhados</small>
            </article>
            <article className="card">
              <AppIcon name="car" />
              <strong>{overview.cards.vehicles.current}</strong>
              <span>Avisos de veículos</span>
              <small>{overview.cards.vehiclesResolved} resolvidos</small>
            </article>
          </div>
          <div className="reports-grid">
            <ReportChart title="Visitantes por semana" kind="line" series={overview.charts.visitorsByWeek} compare={overview.charts.previousVisitorsByWeek} />
            <ReportChart title="Cidades de origem" series={overview.charts.cities} />
            <ReportChart title="Origem dos registros" kind="donut" series={overview.charts.sources} />
            <ReportChart title="Primeiras visitas versus retornos" series={overview.charts.firstVsReturning} />
            <ReportChart title="Movimento da portaria por horário" series={overview.charts.gateHours} />
          </div>
          <p className="reports-footnote">
            Dados atualizados em {generated} • Somente informações da {overview.churchName}
            {overview.historicRemoved ? ' • Parte deste período usa resumos anônimos após a retenção.' : ''}
          </p>
        </>
      )}

      {!loading && tab === 'visitors' && visitors && (
        <>
          <div className="reports-kpis">
            <article className="card"><strong>{visitors.totals.current}</strong><span>Visitantes</span><small>{compareText(visitors.totals.percent)}</small></article>
            <article className="card"><strong>{visitors.averagePerService ?? '—'}</strong><span>Média por culto</span></article>
            <article className="card"><strong>{visitors.first}</strong><span>Primeira visita</span></article>
            <article className="card"><strong>{visitors.returning}</strong><span>Retornos</span></article>
            <article className="card"><strong>{visitors.unknown}</strong><span>Não informado</span></article>
            <article className="card"><strong>{visitors.followUps}</strong><span>Incluídos no acompanhamento</span></article>
          </div>
          <div className="reports-grid">
            <ReportChart title="Visitantes por dia" series={visitors.byDay} />
            <ReportChart title="Visitantes por semana" series={visitors.byWeek} />
            <ReportChart title="Visitantes por mês" series={visitors.byMonth} />
            <ReportChart title="Cidades de origem" series={visitors.cities} />
            <ReportChart title="Origem dos registros" kind="donut" series={visitors.sources} />
            <ReportChart title="Quantidade por culto" series={visitors.services.map((item) => ({ label: item.title, value: item.visitors }))} />
          </div>
          {visitors.followUp && (
            <section className="reports-follow card">
              <h2>Acompanhamento</h2>
              <div className="reports-kpis compact">
                <article><strong>{visitors.followUp.included}</strong><span>Incluídos</span></article>
                <article><strong>{visitors.followUp.awaiting}</strong><span>Aguardando primeiro contato</span></article>
                <article><strong>{visitors.followUp.contacted}</strong><span>Contatos realizados</span></article>
                <article><strong>{visitors.followUp.integrating}</strong><span>Em integração</span></article>
                <article><strong>{visitors.followUp.closed}</strong><span>Encerrados</span></article>
                <article><strong>{visitors.followUp.due}</strong><span>Contatos previstos</span></article>
                <article><strong>{visitors.followUp.overdue}</strong><span>Contatos atrasados</span></article>
              </div>
              <ReportChart title="Quantidade por responsável" series={visitors.followUp.assignees} />
              {visitors.followUp.historicRemoved && (
                <p className="reports-footnote">Parte dos totais veio de resumos anônimos após a retenção.</p>
              )}
            </section>
          )}
        </>
      )}

      {!loading && tab === 'prayers' && prayers && (
        <>
          <div className="reports-kpis">
            <article className="card"><strong>{prayers.totals.current}</strong><span>Total recebido</span><small>{compareText(prayers.totals.percent)}</small></article>
            {Object.entries(prayers.byStatus).map(([key, value]) => (
              <article className="card" key={key}>
                <strong>{value}</strong>
                <span>{PRAYER_CARE_LABELS[key as keyof typeof PRAYER_CARE_LABELS] || key}</span>
              </article>
            ))}
            <article className="card"><strong>{prayers.projected}</strong><span>Autorizados para projeção</span></article>
          </div>
          <ReportChart title="Origem dos pedidos" kind="donut" series={prayers.sources} />
          {prayers.historicRemoved && <p className="reports-footnote">Parte dos totais veio de resumos anônimos após a retenção.</p>}
        </>
      )}

      {!loading && tab === 'vehicles' && vehicles && (
        <>
          <div className="reports-kpis">
            <article className="card"><strong>{vehicles.total}</strong><span>Avisos</span></article>
            <article className="card"><strong>{vehicles.pending}</strong><span>Pendentes</span></article>
            <article className="card"><strong>{vehicles.announced}</strong><span>Anunciados</span></article>
            <article className="card"><strong>{vehicles.resolved}</strong><span>Resolvidos</span></article>
            <article className="card"><strong>{formatMs(vehicles.averageAnnounceMs)}</strong><span>Tempo médio até anunciar</span></article>
            <article className="card"><strong>{formatMs(vehicles.averageResolveMs)}</strong><span>Tempo médio até resolver</span></article>
          </div>
          <div className="reports-grid">
            <ReportChart title="Tipo de solicitação" series={vehicles.actions} />
            <ReportChart title="Horários mais frequentes" series={vehicles.hours} />
            <ReportChart title="Origem do aviso" kind="donut" series={vehicles.sources} />
          </div>
        </>
      )}

      {!loading && tab === 'accesses' && accesses && (
        <>
          <div className="reports-kpis">
            <article className="card"><strong>{accesses.active}</strong><span>Acessos ativos</span></article>
            <article className="card"><strong>{accesses.expired}</strong><span>Expirados</span></article>
            <article className="card"><strong>{accesses.expiringSoon}</strong><span>Próximos de expirar</span></article>
            <article className="card"><strong>{accesses.opened}</strong><span>Aberturas</span></article>
            <article className="card"><strong>{accesses.started}</strong><span>Formulários iniciados</span></article>
            <article className="card"><strong>{accesses.submitted}</strong><span>Envios concluídos</span></article>
            <article className="card"><strong>{accesses.completionRate == null ? '—' : `${accesses.completionRate}%`}</strong><span>Taxa de conclusão</span></article>
            <article className="card"><strong>{accesses.qr}</strong><span>QR Code</span></article>
            <article className="card"><strong>{accesses.sharedLink}</strong><span>Link compartilhado</span></article>
          </div>
          <div className="reports-grid">
            <ReportChart title="Utilização por finalidade" series={accesses.purposes || []} />
            <ReportChart
              title="Formulários enviados por acesso"
              series={accesses.submissionsByAccess.map((item) => ({ label: item.name, value: item.submissions }))}
            />
          </div>
          <section className="card reports-list">
            <h3>Última utilização</h3>
            {accesses.lastUsed.length === 0 ? (
              <p className="report-empty">Nenhum acesso utilizado neste recorte.</p>
            ) : (
              <ul>
                {accesses.lastUsed.map((item) => (
                  <li key={`${item.name}-${item.lastUsedAt}`}>
                    <strong>{item.name}</strong>
                    <span>{item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString('pt-BR') : 'Sem uso registrado'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {!loading && tab === 'service' && (
        serviceReport ? (
          <>
            <section className="card reports-service-head">
              <h2>{serviceReport.service.title}</h2>
              <p>
                {serviceReport.service.time || 'Horário não informado'} ·{' '}
                {serviceReport.service.cancelledAt ? 'Cancelado' : serviceReport.service.closedAt ? 'Encerrado' : 'Programado'}
              </p>
            </section>
            <div className="reports-kpis">
              <article className="card"><strong>{serviceReport.visitors.total}</strong><span>Visitantes</span></article>
              <article className="card"><strong>{serviceReport.visitors.first}</strong><span>Primeiras visitas</span></article>
              <article className="card"><strong>{serviceReport.visitors.returning}</strong><span>Retornos</span></article>
              <article className="card"><strong>{serviceReport.prayers}</strong><span>Pedidos de oração</span></article>
              <article className="card"><strong>{serviceReport.vehicles.total}</strong><span>Avisos de veículos</span></article>
            </div>
            <div className="reports-grid">
              <ReportChart title="Cidades de origem" series={serviceReport.visitors.cities} />
              <ReportChart title="Origem dos registros" series={serviceReport.visitors.sources} />
              <ReportChart title="Movimento por horário" series={serviceReport.visitors.hours} />
            </div>
            <section className="card reports-list">
              <h3>Louvores definidos</h3>
              {serviceReport.service.hymns.length === 0 ? (
                <p className="report-empty">Nenhum louvor neste culto.</p>
              ) : (
                <ul>
                  {serviceReport.service.hymns.map((hymn) => (
                    <li key={hymn.title}>
                      <strong>{hymn.title}</strong>
                      <span>{hymn.artist}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <p className="report-empty card">Escolha um culto nos filtros para ver o relatório.</p>
        )
      )}

      {exportOpen && (
        <div className="reports-modal-backdrop" role="presentation" onClick={() => setExportOpen(false)}>
          <div className="reports-modal card" role="dialog" aria-labelledby="export-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="export-title">Exportar relatório</h2>
            <p>A exportação usa os filtros já aplicados e é gerada no servidor.</p>
            <div className="reports-export-options">
              <button type="button" disabled={exporting} onClick={() => exportReport('pdf')}>PDF resumido</button>
              <button type="button" disabled={exporting} onClick={() => exportReport('csv')}>CSV</button>
              <button type="button" disabled={exporting} onClick={() => exportReport('xlsx')}>XLSX</button>
              <button type="button" disabled={exporting} onClick={() => exportReport('follow_up_list')}>
                Lista autorizada para acompanhamento
              </button>
              <button type="button" disabled={exporting || !query.serviceId} onClick={() => exportReport('service')}>
                Relatório de culto
              </button>
              {canExportSensitive && (
                <button type="button" disabled={exporting || !query.serviceId} onClick={() => exportReport('service', true)}>
                  Relatório de culto detalhado
                </button>
              )}
            </div>
            {exporting && <p>Exportação em andamento...</p>}
            {exportMessage && <p role="status">{exportMessage}</p>}
            <button type="button" className="reports-clear" onClick={() => setExportOpen(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
