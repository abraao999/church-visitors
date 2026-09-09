import { Router, type Response } from 'express';
import { Types } from 'mongoose';
import { requireAuth, toActor, type AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { Church } from '../models/Church.js';
import { ReportExportAudit } from '../models/ReportExportAudit.js';
import { Service } from '../models/Service.js';
import {
  buildAccessReport,
  buildFollowUpReport,
  buildOverview,
  buildPrayerReport,
  buildServiceReport,
  buildVehicleReport,
  buildVisitorReport,
  consentedFollowUpRows,
  timezoneForReports,
  type ReportSourceFilter,
} from '../services/reports.js';
import { hasPermission } from '../utils/permissions.js';
import {
  buildCsv,
  buildSummaryPdf,
  buildXlsx,
  buildZip,
  compareLabel,
  formatDurationMs,
} from '../utils/reportExport.js';
import { sendPrivateJson, setPrivateCacheHeaders } from '../utils/publicRecord.js';
import {
  resolveReportRange,
  type ReportRange,
} from '../utils/reportRange.js';
import { withChurch } from '../utils/tenant.js';

const router = Router();

const SOURCES = ['owner', 'guest_access', 'portaria_device', 'all'] as const;
const EXPORT_FORMATS = ['pdf', 'csv', 'xlsx', 'follow_up_list', 'service'] as const;

function rejectsClientChurchId(value: unknown) {
  return Boolean(value && typeof value === 'object' && 'churchId' in value);
}

function parseSource(value: unknown): ReportSourceFilter {
  return SOURCES.includes(value as (typeof SOURCES)[number])
    ? (value as ReportSourceFilter)
    : 'all';
}

function queryRecord(req: AuthenticatedRequest) {
  return { ...req.query, ...(req.body && typeof req.body === 'object' ? req.body : {}) };
}

async function resolveScopedRange(req: AuthenticatedRequest, res: Response) {
  if (rejectsClientChurchId(req.query) || rejectsClientChurchId(req.body)) {
    res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    return null;
  }
  const churchId = req.auth!.churchId;
  const timeZone = await timezoneForReports(churchId);
  const input = queryRecord(req);
  const resolved = resolveReportRange({
    preset: input.preset,
    from: input.from,
    to: input.to,
    timeZone,
  });
  if (resolved.error || !resolved.range) {
    res.status(400).json({ error: resolved.error || 'Informe um período válido.' });
    return null;
  }
  const serviceId = typeof input.serviceId === 'string' && input.serviceId ? input.serviceId : undefined;
  if (serviceId) {
    if (!Types.ObjectId.isValid(serviceId)) {
      res.status(404).json({ error: 'Culto não encontrado.' });
      return null;
    }
    const service = await Service.exists(withChurch(churchId, { _id: serviceId }));
    if (!service) {
      res.status(404).json({ error: 'Culto não encontrado.' });
      return null;
    }
  }
  return {
    churchId,
    range: resolved.range,
    serviceId,
    source: parseSource(input.source),
    timeZone,
  };
}

async function canReadFollowUp(churchId: string, permissions: readonly string[]) {
  if (!hasPermission(permissions, 'follow_up:read')) return false;
  const church = await Church.findById(churchId).select('visitorFollowUpEnabled');
  return church?.visitorFollowUpEnabled === true;
}

export async function getReportsOverview(req: AuthenticatedRequest, res: Response) {
  try {
    const scoped = await resolveScopedRange(req, res);
    if (!scoped) return;
    const overview = await buildOverview(scoped.churchId, scoped.range, {
      serviceId: scoped.serviceId,
      source: scoped.source,
    });
    return sendPrivateJson(res, overview);
  } catch {
    res.status(500).json({ error: 'Não foi possível carregar a visão geral.' });
  }
}

export async function getReportsVisitors(req: AuthenticatedRequest, res: Response) {
  try {
    const scoped = await resolveScopedRange(req, res);
    if (!scoped) return;
    const visitors = await buildVisitorReport(scoped.churchId, scoped.range, {
      serviceId: scoped.serviceId,
      source: scoped.source,
    });
    const followUp = (await canReadFollowUp(scoped.churchId, req.auth!.permissions))
      ? await buildFollowUpReport(scoped.churchId, scoped.range)
      : null;
    return sendPrivateJson(res, { ...visitors, followUp });
  } catch {
    res.status(500).json({ error: 'Não foi possível carregar o relatório de visitantes.' });
  }
}

export async function getReportsPrayers(req: AuthenticatedRequest, res: Response) {
  try {
    const scoped = await resolveScopedRange(req, res);
    if (!scoped) return;
    return sendPrivateJson(res, await buildPrayerReport(scoped.churchId, scoped.range, { serviceId: scoped.serviceId }));
  } catch {
    res.status(500).json({ error: 'Não foi possível carregar o relatório de oração.' });
  }
}

export async function getReportsVehicles(req: AuthenticatedRequest, res: Response) {
  try {
    const scoped = await resolveScopedRange(req, res);
    if (!scoped) return;
    return sendPrivateJson(
      res,
      await buildVehicleReport(scoped.churchId, scoped.range, {
        serviceId: scoped.serviceId,
        source: scoped.source,
      })
    );
  } catch {
    res.status(500).json({ error: 'Não foi possível carregar o relatório de veículos.' });
  }
}

export async function getReportsAccesses(req: AuthenticatedRequest, res: Response) {
  try {
    const scoped = await resolveScopedRange(req, res);
    if (!scoped) return;
    return sendPrivateJson(res, await buildAccessReport(scoped.churchId, scoped.range));
  } catch {
    res.status(500).json({ error: 'Não foi possível carregar o relatório de acessos.' });
  }
}

export async function getReportsService(req: AuthenticatedRequest, res: Response) {
  try {
    const scoped = await resolveScopedRange(req, res);
    if (!scoped) return;
    const serviceId = typeof req.params.serviceId === 'string' ? req.params.serviceId : '';
    if (!serviceId || !Types.ObjectId.isValid(serviceId)) {
      return res.status(404).json({ error: 'Culto não encontrado.' });
    }
    const report = await buildServiceReport(scoped.churchId, serviceId, scoped.range);
    if (!report) return res.status(404).json({ error: 'Culto não encontrado.' });
    return sendPrivateJson(res, report);
  } catch {
    res.status(500).json({ error: 'Não foi possível carregar o relatório do culto.' });
  }
}

function periodLabel(range: ReportRange) {
  return `${range.fromKey} a ${range.toKey}`;
}

async function auditExport(
  req: AuthenticatedRequest,
  format: string,
  section: string,
  range: ReportRange
) {
  await ReportExportAudit.create({
    churchId: req.auth!.churchId,
    format,
    section,
    periodFrom: range.fromKey,
    periodTo: range.toKey,
    createdBy: toActor(req.auth!),
  });
}

function sendFile(res: Response, filename: string, mime: string, body: Buffer) {
  setPrivateCacheHeaders(res);
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(body);
}

export async function createReportExport(req: AuthenticatedRequest, res: Response) {
  try {
    const scoped = await resolveScopedRange(req, res);
    if (!scoped) return;
    const format = EXPORT_FORMATS.includes(req.body?.format) ? req.body.format : '';
    if (!format) {
      return res.status(400).json({ error: 'Informe um formato de exportação válido.' });
    }
    if (!hasPermission(req.auth!.permissions, 'reports:export') && format !== 'follow_up_list') {
      return res.status(403).json({ error: 'Você não tem permissão para exportar relatórios.' });
    }
    if (format === 'follow_up_list' && !hasPermission(req.auth!.permissions, 'reports:export_sensitive')) {
      return res.status(403).json({ error: 'Você não tem permissão para exportar dados pessoais.' });
    }

    const church = await Church.findById(scoped.churchId).select('name branding');
    const churchName = church?.name || 'Igreja';
    const generatedAt = new Date().toLocaleString('pt-BR', { timeZone: scoped.timeZone });
    const [overview, visitors, prayers, vehicles, accesses] = await Promise.all([
      buildOverview(scoped.churchId, scoped.range, { serviceId: scoped.serviceId, source: scoped.source }),
      buildVisitorReport(scoped.churchId, scoped.range, { serviceId: scoped.serviceId, source: scoped.source }),
      buildPrayerReport(scoped.churchId, scoped.range, { serviceId: scoped.serviceId }),
      buildVehicleReport(scoped.churchId, scoped.range, { serviceId: scoped.serviceId, source: scoped.source }),
      buildAccessReport(scoped.churchId, scoped.range),
    ]);

    if (format === 'pdf') {
      const body = buildSummaryPdf({
        churchName,
        primaryColor: church?.branding?.primaryColor,
        accentColor: church?.branding?.accentColor,
        periodLabel: periodLabel(scoped.range),
        generatedAt,
        lines: [
          `Visitantes: ${overview.cards.visitors.current} (${compareLabel(overview.cards.visitors.percent)})`,
          `Media por culto: ${overview.cards.averagePerService.current ?? 'Sem dados suficientes'}`,
          `Pedidos de oracao: ${overview.cards.prayers.current}`,
          `Pedidos acompanhados: ${overview.cards.prayersFollowed}`,
          `Avisos de veiculos: ${overview.cards.vehicles.current}`,
          `Avisos resolvidos: ${overview.cards.vehiclesResolved}`,
          `Primeiras visitas: ${visitors.first}`,
          `Retornos: ${visitors.returning}`,
          `Nao informado: ${visitors.unknown}`,
        ],
      });
      return sendFile(res, `relatorio-${scoped.range.fromKey}-${scoped.range.toKey}.pdf`, 'application/pdf', body);
    }

    if (format === 'follow_up_list') {
      await auditExport(req, format, 'follow_up', scoped.range);
      const rows = await consentedFollowUpRows(scoped.churchId, scoped.range);
      const body = buildCsv(
        ['Nome', 'Cidade', 'Telefone', 'Data da visita', 'Culto', 'Responsavel', 'Situacao', 'Proximo contato', 'Ultimo contato'],
        rows.map((row) => [
          row.name,
          row.city,
          row.phone,
          row.visitDate ? new Date(row.visitDate).toISOString() : '',
          row.serviceId,
          row.assignedToName,
          row.status,
          row.nextContactAt ? new Date(row.nextContactAt).toISOString() : '',
          row.lastContactAt ? new Date(row.lastContactAt).toISOString() : '',
        ])
      );
      return sendFile(res, `acompanhamento-autorizado-${scoped.range.fromKey}.csv`, 'text/csv; charset=utf-8', body);
    }

    if (format === 'service') {
      const serviceId = typeof req.body?.serviceId === 'string' ? req.body.serviceId : scoped.serviceId;
      if (!serviceId) return res.status(400).json({ error: 'Escolha um culto para exportar.' });
      const report = await buildServiceReport(scoped.churchId, serviceId, scoped.range);
      if (!report) return res.status(404).json({ error: 'Culto não encontrado.' });
      const detailed = req.body?.detailed === true;
      if (detailed && !hasPermission(req.auth!.permissions, 'reports:export_sensitive')) {
        return res.status(403).json({ error: 'Você não tem permissão para exportar o relatório detalhado do culto.' });
      }
      if (detailed) await auditExport(req, format, 'service', scoped.range);
      const body = buildSummaryPdf({
        churchName,
        primaryColor: church?.branding?.primaryColor,
        periodLabel: periodLabel(scoped.range),
        generatedAt,
        lines: [
          `Culto: ${report.service.title}`,
          `Horario: ${report.service.time || 'nao informado'}`,
          `Visitantes: ${report.visitors.total}`,
          `Primeiras visitas: ${report.visitors.first}`,
          `Retornos: ${report.visitors.returning}`,
          `Pedidos de oracao: ${report.prayers}`,
          `Avisos de veiculos: ${report.vehicles.total}`,
          `Louvores: ${report.service.hymns.map((hymn) => hymn.title).join(', ') || 'nenhum'}`,
          detailed ? 'Versao detalhada autorizada. Textos de oracao permanecem ocultos.' : 'Versao resumida, sem dados pessoais.',
        ],
      });
      return sendFile(res, `culto-${serviceId.slice(-6)}.pdf`, 'application/pdf', body);
    }

    const sheets = [
      {
        name: 'Resumo',
        headers: ['Indicador', 'Atual', 'Anterior', 'Variacao'],
        rows: [
          ['Visitantes', overview.cards.visitors.current, overview.cards.visitors.previous, compareLabel(overview.cards.visitors.percent)],
          ['Media por culto', overview.cards.averagePerService.current, overview.cards.averagePerService.previous, compareLabel(overview.cards.averagePerService.percent)],
          ['Pedidos de oracao', overview.cards.prayers.current, overview.cards.prayers.previous, compareLabel(overview.cards.prayers.percent)],
          ['Avisos de veiculos', overview.cards.vehicles.current, overview.cards.vehicles.previous, compareLabel(overview.cards.vehicles.percent)],
        ],
      },
      {
        name: 'Visitantes',
        headers: ['Data', 'Quantidade'],
        rows: visitors.byDay.map((item) => [item.label, item.value]),
      },
      {
        name: 'Cidades',
        headers: ['Cidade', 'Quantidade'],
        rows: visitors.cities.map((item) => [item.label, item.value]),
      },
      {
        name: 'Cultos',
        headers: ['Culto', 'Visitantes'],
        rows: visitors.services.map((item) => [item.title, item.visitors]),
      },
      {
        name: 'Pedidos',
        headers: ['Situacao', 'Quantidade'],
        rows: Object.entries(prayers.byStatus).map(([label, value]) => [label, value]),
      },
      {
        name: 'Veiculos',
        headers: ['Indicador', 'Valor'],
        rows: [
          ['Total', vehicles.total],
          ['Pendentes', vehicles.pending],
          ['Anunciados', vehicles.announced],
          ['Resolvidos', vehicles.resolved],
          ['Tempo medio ate anunciar', formatDurationMs(vehicles.averageAnnounceMs)],
          ['Tempo medio ate resolver', formatDurationMs(vehicles.averageResolveMs)],
        ],
      },
      {
        name: 'Acessos',
        headers: ['Indicador', 'Valor'],
        rows: [
          ['Aberturas', accesses.opened],
          ['Formularios iniciados', accesses.started],
          ['Envios', accesses.submitted],
          ['QR Code', accesses.qr],
          ['Link compartilhado', accesses.sharedLink],
          ['Taxa de conclusao', accesses.completionRate == null ? 'Sem dados suficientes' : `${accesses.completionRate}%`],
        ],
      },
    ];

    if (format === 'xlsx') {
      return sendFile(
        res,
        `relatorio-${scoped.range.fromKey}-${scoped.range.toKey}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buildXlsx(sheets)
      );
    }

    const zip = buildZip(
      sheets.map((sheet) => ({
        name: `${sheet.name.toLowerCase()}.csv`,
        content: buildCsv(sheet.headers, sheet.rows),
      }))
    );
    return sendFile(res, `relatorio-${scoped.range.fromKey}-${scoped.range.toKey}.zip`, 'application/zip', zip);
  } catch {
    res.status(500).json({ error: 'Não foi possível gerar a exportação.' });
  }
}

router.get('/overview', requireAuth, requirePermission('reports:read'), getReportsOverview);
router.get('/visitors', requireAuth, requirePermission('reports:read'), getReportsVisitors);
router.get('/prayers', requireAuth, requirePermission('reports:read'), getReportsPrayers);
router.get('/vehicles', requireAuth, requirePermission('reports:read'), getReportsVehicles);
router.get('/accesses', requireAuth, requirePermission('reports:read'), getReportsAccesses);
router.get('/services/:serviceId', requireAuth, requirePermission('reports:read'), getReportsService);
router.post('/exports', requireAuth, requirePermission('reports:read'), createReportExport);

export default router;
