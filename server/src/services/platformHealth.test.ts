import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import mongoose, { Types } from 'mongoose';
import { RetentionPolicy } from '../models/RetentionPolicy.js';
import { SystemHealthEvent, HEALTH_EVENT_TTL_DAYS } from '../models/SystemHealthEvent.js';
import { SystemJobRun, SYSTEM_JOB_HISTORY_DAYS } from '../models/SystemJobRun.js';
import {
  computeOverallStatus,
  inspectEmailDeliveryConfig,
  inspectStorageConfig,
  loadPlatformHealth,
  nextRetentionRunAt,
  runRetentionCronWithHealth,
} from './platformHealth.js';

type Stub = { restore: () => void };
const stubs: Stub[] = [];

function stubMethod(target: object, method: string, implementation: unknown): void {
  const original = (target as Record<string, unknown>)[method];
  (target as Record<string, unknown>)[method] = implementation;
  stubs.push({
    restore: () => {
      (target as Record<string, unknown>)[method] = original;
    },
  });
}

function stubReadyState(value: number): void {
  Object.defineProperty(mongoose.connection, 'readyState', {
    configurable: true,
    get: () => value,
  });
  stubs.push({
    restore: () => {
      delete (mongoose.connection as { readyState?: unknown }).readyState;
    },
  });
}

afterEach(() => {
  while (stubs.length) stubs.pop()?.restore();
});

describe('saúde da plataforma', () => {
  test('calcula healthy, warning e critical', () => {
    assert.equal(
      computeOverallStatus([
        { status: 'healthy' },
        { status: 'healthy' },
        { status: 'healthy' },
        { status: 'healthy' },
      ]),
      'healthy'
    );
    assert.equal(
      computeOverallStatus([
        { status: 'healthy' },
        { status: 'healthy' },
        { status: 'not_configured' },
        { status: 'healthy' },
      ]),
      'warning'
    );
    assert.equal(
      computeOverallStatus([
        { status: 'healthy' },
        { status: 'critical' },
        { status: 'not_configured' },
      ]),
      'critical'
    );
  });

  test('próxima retenção é 06:00 UTC', () => {
    const before = nextRetentionRunAt(new Date('2026-09-13T05:00:00.000Z'));
    assert.equal(before.toISOString(), '2026-09-13T06:00:00.000Z');
    const after = nextRetentionRunAt(new Date('2026-09-13T06:00:00.000Z'));
    assert.equal(after.toISOString(), '2026-09-14T06:00:00.000Z');
  });

  test('e-mail e armazenamento não revelam segredos', () => {
    const email = inspectEmailDeliveryConfig({
      RESEND_API_KEY: 're_chave-secreta-nao-pode-vazar',
      EMAIL_FROM: 'Eclesiafy <acesso@notificacoes.eclesiafy.com.br>',
    });
    const storage = inspectStorageConfig({
      BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_secret_value',
    });
    assert.equal(email.status, 'healthy');
    assert.equal(storage.status, 'healthy');
    assert.equal(JSON.stringify(email).includes('re_chave'), false);
    assert.equal(JSON.stringify(storage).includes('vercel_blob'), false);
    assert.equal(inspectEmailDeliveryConfig({}).status, 'not_configured');
    assert.equal(inspectStorageConfig({}).status, 'not_configured');
  });

  test('TTL técnico é de 90 dias', () => {
    assert.equal(SYSTEM_JOB_HISTORY_DAYS, 90);
    assert.equal(HEALTH_EVENT_TTL_DAYS, 90);
    assert.ok(SystemJobRun.schema.path('expiresAt'));
    assert.ok(SystemHealthEvent.schema.path('expiresAt'));
    assert.ok(SystemJobRun.schema.indexes().some((item) => item[0].job === 1 && item[0].startedAt === -1));
  });

  test('resposta sanitizada não mistura dados de igreja', async () => {
    stubMethod(SystemJobRun, 'findOne', () => ({
      select: () => ({
        sort: () => ({
          lean: async () => ({
            status: 'completed',
            startedAt: new Date('2026-09-13T06:02:00.000Z'),
            completedAt: new Date('2026-09-13T06:02:08.000Z'),
            durationMs: 8000,
            summary: { policiesFound: 2, churchesProcessed: 2, churchesSkipped: 0, failures: 0 },
          }),
        }),
      }),
    }));
    stubMethod(SystemHealthEvent, 'countDocuments', async () => 0);
    stubMethod(SystemHealthEvent, 'find', () => ({
      select: () => ({
        sort: () => ({
          limit: () => ({
            lean: async () => [
              {
                _id: new Types.ObjectId(),
                source: 'email',
                type: 'email_delivery_failed',
                severity: 'warning',
                safeMessage: 'O provedor recusou temporariamente o envio de e-mail.',
                createdAt: new Date(),
              },
            ],
          }),
        }),
      }),
    }));

    const health = await loadPlatformHealth({
      RESEND_API_KEY: 're_chave-secreta-nao-pode-vazar',
      BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_secret_value',
      VERCEL_ENV: 'production',
      VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890',
    });
    const serialized = JSON.stringify(health);
    assert.equal(serialized.includes('re_chave'), false);
    assert.equal(serialized.includes('vercel_blob'), false);
    assert.equal(serialized.includes('mongodb'), false);
    assert.equal(serialized.includes('password'), false);
    assert.equal(serialized.includes('churchId'), false);
    assert.equal(health.deployment.commit, 'abcdef1');
    assert.equal(health.jobs[0].status, 'completed');
    assert.equal(health.incidents[0].message.includes('@'), false);
    assert.equal(health.services.some((item) => item.key === 'api'), true);
  });

  test('ausência de execução anterior não causa erro', async () => {
    stubMethod(SystemJobRun, 'findOne', () => ({
      select: () => ({
        sort: () => ({
          lean: async () => null,
        }),
      }),
    }));
    stubMethod(SystemHealthEvent, 'countDocuments', async () => 0);
    stubMethod(SystemHealthEvent, 'find', () => ({
      select: () => ({
        sort: () => ({
          limit: () => ({
            lean: async () => [],
          }),
        }),
      }),
    }));
    const health = await loadPlatformHealth({});
    assert.equal(health.jobs[0].status, 'never_run');
    assert.equal(health.incidents.length, 0);
    assert.equal(health.services.find((item) => item.key === 'email')?.status, 'not_configured');
  });

  test('cron registra conclusão e falha sem alterar a retenção', async () => {
    stubReadyState(1);
    stubMethod(RetentionPolicy, 'find', () => ({
      select: () => ({
        sort: () => ({
          limit: async () => [],
        }),
      }),
    }));
    let created: Record<string, unknown> | undefined;
    let finished: Record<string, unknown> | undefined;
    stubMethod(SystemJobRun, 'create', async (doc: Record<string, unknown>) => {
      created = doc;
      return { _id: new Types.ObjectId() };
    });
    stubMethod(SystemJobRun, 'findById', () => ({
      select: async () => ({ startedAt: new Date() }),
    }));
    stubMethod(SystemJobRun, 'updateOne', async (_id: unknown, update: { $set: Record<string, unknown> }) => {
      finished = update.$set;
      return { modifiedCount: 1 };
    });
    stubMethod(SystemHealthEvent, 'create', async () => [{}]);

    const result = await runRetentionCronWithHealth();
    assert.equal(result.ok, true);
    assert.equal(created?.job, 'retention');
    assert.equal(created?.trigger, 'cron');
    assert.equal(finished?.status, 'completed');

    stubMethod(RetentionPolicy, 'find', () => {
      throw new Error('falha interna do mongo');
    });
    await assert.rejects(() => runRetentionCronWithHealth(), /retention_cron_failed/);
  });
});
