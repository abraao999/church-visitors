import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { isPlaceholderSecret } from '../utils/configuredSecret.js';
import { DEFAULT_EMAIL_FROM } from '../utils/emailConfig.js';
import {
  SystemHealthEvent,
  SYSTEM_HEALTH_SAFE_MESSAGES,
  recordSystemHealthEvent,
  type SystemHealthEventType,
} from '../models/SystemHealthEvent.js';
import { SystemJobRun, finishSystemJobRun, startSystemJobRun } from '../models/SystemJobRun.js';
import { runAutomaticRetention } from './retention.js';

export type HealthOverall = 'healthy' | 'warning' | 'critical' | 'unknown';
export type HealthServiceStatus = 'healthy' | 'warning' | 'critical' | 'not_configured' | 'unknown';

export interface PlatformHealthService {
  key: 'api' | 'database' | 'email' | 'storage';
  label: string;
  status: HealthServiceStatus;
  message: string;
  latencyMs?: number;
}

export interface PlatformHealthJob {
  key: 'retention';
  label: string;
  scheduleLabel: string;
  lastStartedAt?: string;
  lastCompletedAt?: string;
  nextRunAt?: string;
  durationMs?: number;
  status: 'completed' | 'failed' | 'running' | 'never_run';
  summary?: {
    policiesFound: number;
    churchesProcessed: number;
    churchesSkipped: number;
    failures: number;
  };
}

export interface PlatformHealthIncident {
  id: string;
  source: string;
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  createdAt: string;
}

export interface PlatformHealthResponse {
  checkedAt: string;
  overall: HealthOverall;
  services: PlatformHealthService[];
  jobs: PlatformHealthJob[];
  incidents: PlatformHealthIncident[];
  deployment: {
    environment?: string;
    version?: string;
    commit?: string;
  };
}

const INCIDENT_TITLES: Record<SystemHealthEventType, string> = {
  email_delivery_failed: 'Falha no envio de e-mail',
  email_not_configured: 'Envio de e-mail sem configuração',
  retention_cron_failed: 'Falha na rotina de retenção',
  retention_partial_failure: 'Retenção concluída com falhas',
  database_unavailable: 'Banco de dados indisponível',
};

const SOURCE_LABELS = {
  email: 'Envio de e-mails',
  retention: 'Retenção de dados',
  database: 'Banco de dados',
  storage: 'Armazenamento',
} as const;

export function computeOverallStatus(services: Array<{ status: HealthServiceStatus }>): HealthOverall {
  if (services.some((item) => item.status === 'critical')) return 'critical';
  if (services.some((item) => item.status === 'unknown')) return 'unknown';
  if (services.some((item) => item.status === 'warning' || item.status === 'not_configured')) {
    return 'warning';
  }
  if (services.length > 0 && services.every((item) => item.status === 'healthy')) return 'healthy';
  return 'unknown';
}

/** Cron `0 6 * * *` (UTC) = 03:00 em America/Sao_Paulo. */
export function nextRetentionRunAt(now = new Date()): Date {
  const next = new Date(now);
  next.setUTCHours(6, 0, 0, 0);
  if (now.getTime() >= next.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

export function inspectEmailDeliveryConfig(env: NodeJS.ProcessEnv = process.env): {
  status: Extract<HealthServiceStatus, 'healthy' | 'warning' | 'not_configured'>;
  message: string;
} {
  const key = (env.RESEND_API_KEY || '').trim();
  const from = (env.EMAIL_FROM || DEFAULT_EMAIL_FROM).trim();
  const hasKey = key.length > 0 && !isPlaceholderSecret(key);
  const hasFrom = /@/.test(from);
  if (!hasKey) {
    return { status: 'not_configured', message: 'Não configurado' };
  }
  if (!hasFrom) {
    return { status: 'warning', message: 'Atenção' };
  }
  return { status: 'healthy', message: 'Configurado' };
}

export function inspectStorageConfig(env: NodeJS.ProcessEnv = process.env): {
  status: Extract<HealthServiceStatus, 'healthy' | 'not_configured'>;
  message: string;
} {
  const token = (env.BLOB_READ_WRITE_TOKEN || '').trim();
  if (!token || isPlaceholderSecret(token)) {
    return { status: 'not_configured', message: 'Não configurado' };
  }
  return { status: 'healthy', message: 'Configurado' };
}

export async function pingDatabase(): Promise<{ ok: boolean; latencyMs: number }> {
  const started = Date.now();
  try {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      return { ok: false, latencyMs: Date.now() - started };
    }
    await mongoose.connection.db.admin().command({ ping: 1 });
    return { ok: true, latencyMs: Date.now() - started };
  } catch {
    return { ok: false, latencyMs: Date.now() - started };
  }
}

function appVersion(): string | undefined {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '../../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return typeof pkg.version === 'string' && pkg.version ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

function deploymentInfo(env: NodeJS.ProcessEnv = process.env) {
  const environment = typeof env.VERCEL_ENV === 'string' && env.VERCEL_ENV.trim() ? env.VERCEL_ENV.trim() : undefined;
  const sha = typeof env.VERCEL_GIT_COMMIT_SHA === 'string' ? env.VERCEL_GIT_COMMIT_SHA.trim() : '';
  return {
    environment,
    version: appVersion(),
    commit: sha ? sha.slice(0, 7) : undefined,
  };
}

export async function loadPlatformHealth(env: NodeJS.ProcessEnv = process.env): Promise<PlatformHealthResponse> {
  const started = Date.now();
  const checkedAt = new Date();
  const db = await pingDatabase();
  if (!db.ok) {
    await recordSystemHealthEvent({
      source: 'database',
      type: 'database_unavailable',
      severity: 'critical',
    });
  }

  const email = inspectEmailDeliveryConfig(env);
  const storage = inspectStorageConfig(env);
  const recentEmailFailures = await SystemHealthEvent.countDocuments({
    source: 'email',
    createdAt: { $gte: new Date(checkedAt.getTime() - 24 * 60 * 60 * 1000) },
  });

  let emailStatus = email.status;
  let emailMessage = email.message;
  if (email.status === 'healthy' && recentEmailFailures > 0) {
    emailStatus = 'warning';
    emailMessage = 'Atenção';
  }

  const apiLatency = Date.now() - started;
  const services: PlatformHealthService[] = [
    {
      key: 'api',
      label: 'API da aplicação',
      status: 'healthy',
      message: 'Online',
      latencyMs: apiLatency,
    },
    {
      key: 'database',
      label: 'Banco de dados',
      status: db.ok ? 'healthy' : 'critical',
      message: db.ok ? 'Conectado' : 'Indisponível',
      latencyMs: db.latencyMs,
    },
    {
      key: 'email',
      label: 'Envio de e-mails',
      status: emailStatus,
      message: emailMessage,
    },
    {
      key: 'storage',
      label: 'Armazenamento',
      status: storage.status,
      message: storage.message,
    },
  ];

  const lastJob = await SystemJobRun.findOne({ job: 'retention' })
    .select('status startedAt completedAt durationMs summary')
    .sort({ startedAt: -1 })
    .lean();

  const job: PlatformHealthJob = {
    key: 'retention',
    label: 'Retenção de dados',
    scheduleLabel: 'Diariamente às 03:00',
    nextRunAt: nextRetentionRunAt(checkedAt).toISOString(),
    status: lastJob?.status === 'completed' || lastJob?.status === 'failed' || lastJob?.status === 'running'
      ? lastJob.status
      : 'never_run',
  };
  if (lastJob?.startedAt) job.lastStartedAt = lastJob.startedAt.toISOString();
  if (lastJob?.completedAt) job.lastCompletedAt = lastJob.completedAt.toISOString();
  if (typeof lastJob?.durationMs === 'number') job.durationMs = lastJob.durationMs;
  if (lastJob?.summary) {
    job.summary = {
      policiesFound: lastJob.summary.policiesFound || 0,
      churchesProcessed: lastJob.summary.churchesProcessed || 0,
      churchesSkipped: lastJob.summary.churchesSkipped || 0,
      failures: lastJob.summary.failures || 0,
    };
  }

  const events = await SystemHealthEvent.find()
    .select('source type severity safeMessage createdAt')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  const incidents: PlatformHealthIncident[] = events.map((event) => ({
    id: String(event._id),
    source: SOURCE_LABELS[event.source] || event.source,
    severity: event.severity,
    title: INCIDENT_TITLES[event.type] || 'Incidente técnico',
    message: event.safeMessage || SYSTEM_HEALTH_SAFE_MESSAGES[event.type] || 'Falha técnica registrada.',
    createdAt: event.createdAt.toISOString(),
  }));

  return {
    checkedAt: checkedAt.toISOString(),
    overall: computeOverallStatus(services),
    services,
    jobs: [job],
    incidents,
    deployment: deploymentInfo(env),
  };
}

export async function runRetentionCronWithHealth(): Promise<{
  ok: boolean;
  selected: number;
  completed: number;
  failed: number;
  skipped: number;
}> {
  const startedAt = new Date();
  const runId = await startSystemJobRun('retention', 'cron', startedAt);
  try {
    const result = await runAutomaticRetention();
    await finishSystemJobRun(runId, {
      status: 'completed',
      summary: {
        policiesFound: result.selected,
        churchesProcessed: result.completed,
        churchesSkipped: result.skipped,
        failures: result.failed,
      },
    });
    if (result.failed > 0) {
      await recordSystemHealthEvent({
        source: 'retention',
        type: 'retention_partial_failure',
        severity: 'warning',
      });
    }
    return { ok: result.failed === 0, ...result };
  } catch {
    await finishSystemJobRun(runId, {
      status: 'failed',
      errorCode: 'retention_cron_failed',
      summary: {
        policiesFound: 0,
        churchesProcessed: 0,
        churchesSkipped: 0,
        failures: 1,
      },
    });
    await recordSystemHealthEvent({
      source: 'retention',
      type: 'retention_cron_failed',
      severity: 'critical',
    });
    throw new Error('retention_cron_failed');
  }
}
