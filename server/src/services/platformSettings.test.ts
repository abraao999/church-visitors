import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { PlatformSettings } from '../models/PlatformSettings.js';
import { RetentionPolicy } from '../models/RetentionPolicy.js';
import { RETENTION_DEFAULTS } from '../models/RetentionPolicy.js';
import {
  REGISTRATIONS_CLOSED_CODE,
  REGISTRATIONS_CLOSED_ERROR,
  SETTINGS_CONFLICT_ERROR,
  SETTINGS_UNKNOWN_ERROR,
  areRegistrationsEnabled,
  builtinPlatformDefaults,
  createRetentionPolicyForChurch,
  describeSettingsChanges,
  formatEmailFromHeader,
  getEffectiveEmailDelivery,
  getNewChurchCreationPlan,
  isAllowedSenderAddress,
  isSupportedTimezone,
  loadPublicPlatformStatus,
  parseEmailFromHeader,
  parseLegalUrl,
  parseSettingsTestEmailBody,
  PlatformSettingsError,
  PLATFORM_AT_CAPACITY_CODE,
  resolveEffectiveMaintenance,
  toAdminSettingsView,
  toPublicPlatformStatus,
  updatePlatformSettings,
  getEffectiveEmailTtl,
  assertPlatformCanAcceptChurch,
} from './platformSettings.js';

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

afterEach(() => {
  while (stubs.length) stubs.pop()?.restore();
  delete process.env.RESEND_API_KEY;
});

function settingsDoc(overrides: Record<string, unknown> = {}) {
  const defaults = builtinPlatformDefaults();
  return {
    ...defaults,
    ...overrides,
    registrations: { ...defaults.registrations, ...(overrides.registrations as object || {}) },
    email: {
      ...defaults.email,
      ...(overrides.email as object || {}),
      ttl: {
        ...defaults.email.ttl,
        ...((overrides.email as { ttl?: object } | undefined)?.ttl || {}),
      },
    },
    newChurchDefaults: {
      ...defaults.newChurchDefaults,
      ...(overrides.newChurchDefaults as object || {}),
      modules: {
        ...defaults.newChurchDefaults.modules,
        ...((overrides.newChurchDefaults as { modules?: object } | undefined)?.modules || {}),
      },
      retention: {
        ...defaults.newChurchDefaults.retention,
        ...((overrides.newChurchDefaults as { retention?: object } | undefined)?.retention || {}),
      },
    },
    maintenance: { ...defaults.maintenance, ...(overrides.maintenance as object || {}) },
    limits: { ...defaults.limits, ...(overrides.limits as object || {}) },
    legal: { ...defaults.legal, ...(overrides.legal as object || {}) },
    notice: { ...defaults.notice, ...(overrides.notice as object || {}) },
    updatedAt: overrides.updatedAt instanceof Date ? overrides.updatedAt : new Date('2026-09-14T12:00:00.000Z'),
    createdAt: new Date('2026-09-14T12:00:00.000Z'),
    save: async function save() {
      this.updatedAt = new Date('2026-09-14T12:05:00.000Z');
      return this;
    },
  };
}

describe('configurações globais da plataforma', () => {
  test('defaults são seguros e o documento não tem churchId', () => {
    const defaults = builtinPlatformDefaults();
    assert.equal(defaults.key, 'global');
    assert.equal(defaults.registrations.enabled, true);
    assert.equal(defaults.registrations.approvalMode, 'automatic');
    assert.equal(defaults.newChurchDefaults.timezone, 'America/Sao_Paulo');
    assert.equal(defaults.newChurchDefaults.visitorFollowUpEnabled, false);
    assert.equal(defaults.newChurchDefaults.retention.enabled, false);
    assert.equal(defaults.newChurchDefaults.retention.visitorsMonths, RETENTION_DEFAULTS.visitorsMonths);
    assert.equal(defaults.maintenance.enabled, false);
    assert.equal(defaults.limits.maxChurches, null);
    assert.equal(defaults.legal.termsUrl, '');
    assert.equal(defaults.notice.enabled, false);
    assert.equal(defaults.newChurchDefaults.modules.visitorFollowUpEnabled, false);
    assert.ok(defaults.email.ttl.verificationMinutes >= 5);
    assert.equal('churchId' in defaults, false);
    assert.equal(PlatformSettings.schema.path('churchId'), undefined);
    assert.ok(PlatformSettings.schema.indexes().some(([fields, options]) => (
      JSON.stringify(fields) === JSON.stringify({ key: 1 }) && (options as { unique?: boolean }).unique === true
    )));
  });

  test('remetente aceita apenas eclesiafy.com.br e subdomínios', () => {
    assert.equal(isAllowedSenderAddress('acesso@notificacoes.eclesiafy.com.br'), true);
    assert.equal(isAllowedSenderAddress('ola@eclesiafy.com.br'), true);
    assert.equal(isAllowedSenderAddress('alguem@gmail.com'), false);
    const parsed = parseEmailFromHeader('Eclesiafy <acesso@notificacoes.eclesiafy.com.br>');
    assert.equal(parsed.name, 'Eclesiafy');
    assert.equal(parsed.address, 'acesso@notificacoes.eclesiafy.com.br');
    assert.equal(formatEmailFromHeader('Eclesiafy', 'acesso@notificacoes.eclesiafy.com.br'), 'Eclesiafy <acesso@notificacoes.eclesiafy.com.br>');
  });

  test('fuso IANA arbitrário é recusado', () => {
    assert.equal(isSupportedTimezone('America/Sao_Paulo'), true);
    assert.equal(isSupportedTimezone('Horario de Brasilia'), false);
    assert.equal(isSupportedTimezone(''), false);
  });

  test('cadastro fechado é a autoridade do backend', async () => {
    stubMethod(PlatformSettings, 'findOne', async () => settingsDoc({
      registrations: { enabled: false, approvalMode: 'automatic' },
    }));
    assert.equal(await areRegistrationsEnabled(), false);
    stubMethod(PlatformSettings, 'findOne', async () => settingsDoc());
    assert.equal(await areRegistrationsEnabled(), true);
    assert.equal(REGISTRATIONS_CLOSED_CODE, 'registrations_closed');
    assert.match(REGISTRATIONS_CLOSED_ERROR, /indisponíveis/);
  });

  test('endpoint público devolve só a allowlist', async () => {
    stubMethod(PlatformSettings, 'findOne', async () => settingsDoc({
      email: { senderName: 'Eclesiafy', senderAddress: 'acesso@notificacoes.eclesiafy.com.br', replyTo: 'priv@eclesiafy.com.br' },
      maintenance: { enabled: true, message: 'Atualização programada neste sábado.' },
    }));
    process.env.RESEND_API_KEY = 're_secret_key_should_not_leak';
    const publicStatus = await loadPublicPlatformStatus();
    const serialized = JSON.stringify(publicStatus);
    assert.deepEqual(Object.keys(publicStatus), ['registrationsEnabled', 'maintenance']);
    assert.deepEqual(Object.keys(publicStatus.maintenance), ['enabled', 'message']);
    assert.equal(serialized.includes('RESEND'), false);
    assert.equal(serialized.includes('re_secret'), false);
    assert.equal(serialized.includes('replyTo'), false);
    assert.equal(serialized.includes('senderAddress'), false);
    assert.equal(serialized.includes('timezone'), false);
    assert.equal(serialized.includes('maxChurches'), false);
    assert.equal(serialized.includes('verificationMinutes'), false);
    assert.equal(serialized.includes('visitorFollowUpEnabled'), false);
    assert.equal(serialized.includes('"notice"'), false);
    assert.equal(publicStatus.maintenance.message.includes('<'), false);
  });

  test('aviso de manutenção recusa HTML e conteúdo excessivo', async () => {
    const current = settingsDoc();
    stubMethod(PlatformSettings, 'findOne', async () => current);
    await assert.rejects(
      () => updatePlatformSettings({
        updatedAt: current.updatedAt.toISOString(),
        registrations: { enabled: true, approvalMode: 'automatic' },
        email: { senderName: 'Eclesiafy', senderAddress: 'acesso@notificacoes.eclesiafy.com.br', replyTo: '' },
        newChurchDefaults: {
          timezone: 'America/Sao_Paulo',
          visitorFollowUpEnabled: false,
          retention: { enabled: false, ...RETENTION_DEFAULTS },
        },
        maintenance: { enabled: true, message: '<script>alert(1)</script>' },
      }),
      (error: unknown) => error instanceof PlatformSettingsError && /HTML/.test(error.message)
    );
    await assert.rejects(
      () => updatePlatformSettings({
        updatedAt: current.updatedAt.toISOString(),
        registrations: { enabled: true, approvalMode: 'automatic' },
        email: { senderName: 'Eclesiafy', senderAddress: 'acesso@notificacoes.eclesiafy.com.br', replyTo: '' },
        newChurchDefaults: {
          timezone: 'America/Sao_Paulo',
          visitorFollowUpEnabled: false,
          retention: { enabled: false, ...RETENTION_DEFAULTS },
        },
        maintenance: { enabled: true, message: 'curto' },
      }),
      (error: unknown) => error instanceof PlatformSettingsError && /10/.test(error.message)
    );
  });

  test('propriedades desconhecidas e conflito de versão são rejeitados', async () => {
    const current = settingsDoc();
    stubMethod(PlatformSettings, 'findOne', async () => current);
    await assert.rejects(
      () => updatePlatformSettings({
        updatedAt: current.updatedAt.toISOString(),
        extra: true,
        registrations: { enabled: true, approvalMode: 'automatic' },
        email: { senderName: 'Eclesiafy', senderAddress: 'acesso@notificacoes.eclesiafy.com.br', replyTo: '' },
        newChurchDefaults: {
          timezone: 'America/Sao_Paulo',
          visitorFollowUpEnabled: false,
          retention: { enabled: false, ...RETENTION_DEFAULTS },
        },
        maintenance: { enabled: false, message: '' },
      }),
      (error: unknown) => error instanceof PlatformSettingsError && error.message.includes(SETTINGS_UNKNOWN_ERROR)
    );
    await assert.rejects(
      () => updatePlatformSettings({
        updatedAt: '2020-01-01T00:00:00.000Z',
        registrations: { enabled: false, approvalMode: 'manual' },
        email: { senderName: 'Eclesiafy', senderAddress: 'acesso@notificacoes.eclesiafy.com.br', replyTo: '' },
        newChurchDefaults: {
          timezone: 'America/Sao_Paulo',
          visitorFollowUpEnabled: false,
          retention: { enabled: false, ...RETENTION_DEFAULTS },
        },
        maintenance: { enabled: false, message: '' },
      }),
      (error: unknown) => (
        error instanceof PlatformSettingsError &&
        error.status === 409 &&
        error.message === SETTINGS_CONFLICT_ERROR
      )
    );
  });

  test('e-mail efetivo usa banco e cai no ambiente', async () => {
    stubMethod(PlatformSettings, 'findOne', async () => settingsDoc({
      email: {
        senderName: 'Eclesiafy Operações',
        senderAddress: 'acesso@notificacoes.eclesiafy.com.br',
        replyTo: 'suporte@eclesiafy.com.br',
      },
    }));
    const saved = await getEffectiveEmailDelivery();
    assert.equal(saved.from, 'Eclesiafy Operações <acesso@notificacoes.eclesiafy.com.br>');
    assert.equal(saved.replyTo, 'suporte@eclesiafy.com.br');

    stubMethod(PlatformSettings, 'findOne', async () => {
      throw new Error('db down');
    });
    const fallback = await getEffectiveEmailDelivery();
    assert.match(fallback.from, /@/);
    assert.equal(JSON.stringify(fallback).includes('RESEND'), false);
  });

  test('resposta administrativa não inclui segredos', () => {
    process.env.RESEND_API_KEY = 're_secret_key_should_not_leak';
    const view = toAdminSettingsView(settingsDoc() as never);
    const serialized = JSON.stringify(view);
    assert.equal(view.registrations.requireEmailConfirmation, true);
    assert.equal(serialized.includes('re_secret'), false);
    assert.equal(serialized.includes('EMAIL_TOKEN_SECRET'), false);
    assert.equal(serialized.includes('JWT'), false);
    assert.equal(view.email.resendStatus, 'verified');
  });

  test('defaults de igreja e retenção usam o churchId informado', async () => {
    stubMethod(PlatformSettings, 'findOne', async () => settingsDoc({
      registrations: { enabled: true, approvalMode: 'manual' },
      newChurchDefaults: {
        timezone: 'America/Manaus',
        visitorFollowUpEnabled: true,
        retention: { enabled: true, ...RETENTION_DEFAULTS, visitorsMonths: 12 },
      },
    }));
    const plan = await getNewChurchCreationPlan();
    assert.equal(plan.approvalMode, 'manual');
    assert.equal(plan.timezone, 'America/Manaus');
    assert.equal(plan.visitorFollowUpEnabled, true);
    assert.equal(plan.retention.visitorsMonths, 12);

    const churchId = new Types.ObjectId();
    let created: Record<string, unknown> | undefined;
    stubMethod(RetentionPolicy, 'create', async (docs: Array<Record<string, unknown>>) => {
      created = docs[0];
      return docs;
    });
    await createRetentionPolicyForChurch(churchId, plan.retention);
    assert.equal(String(created?.churchId), String(churchId));
    assert.equal(created?.visitorsMonths, 12);
    assert.equal(created?.enabled, true);
  });

  test('auditoria sanitizada lista só chaves não sensíveis', () => {
    const before = toAdminSettingsView(settingsDoc() as never);
    const after = toAdminSettingsView(settingsDoc({
      registrations: { enabled: false, approvalMode: 'manual' },
      email: { senderName: 'Eclesiafy', senderAddress: 'novo@notificacoes.eclesiafy.com.br', replyTo: 'x@eclesiafy.com.br' },
    }) as never);
    const changes = describeSettingsChanges(before, after);
    assert.match(String(changes.changed), /registrations.enabled/);
    assert.match(String(changes.changed), /email.senderAddress/);
    assert.equal(JSON.stringify(changes).includes('novo@'), false);
    assert.equal(JSON.stringify(changes).includes('x@eclesiafy'), false);
  });

  test('manutenção desligada não devolve a mensagem no endpoint público', () => {
    const status = toPublicPlatformStatus(settingsDoc({
      maintenance: { enabled: false, message: 'Texto guardado internamente.' },
    }) as never);
    assert.equal(status.maintenance.enabled, false);
    assert.equal(status.maintenance.message, '');
    assert.equal('closedMessage' in status, false);
  });

  test('mensagem de cadastro fechado só sai no público quando o cadastro está fechado', () => {
    const closed = toPublicPlatformStatus(settingsDoc({
      registrations: { enabled: false, approvalMode: 'automatic', closedMessage: 'Cadastros pausados neste mês.' },
    }) as never);
    assert.equal(closed.registrationsEnabled, false);
    assert.equal(closed.closedMessage, 'Cadastros pausados neste mês.');
    assert.equal(JSON.stringify(closed).includes('<'), false);

    const emptyClosed = toPublicPlatformStatus(settingsDoc({
      registrations: { enabled: false, approvalMode: 'automatic', closedMessage: '' },
    }) as never);
    assert.equal('closedMessage' in emptyClosed, false);

    const open = toPublicPlatformStatus(settingsDoc({
      registrations: { enabled: true, approvalMode: 'automatic', closedMessage: 'Não deve vazar.' },
    }) as never);
    assert.equal('closedMessage' in open, false);
  });

  test('janela vigente liga a manutenção pública sem o interruptor', () => {
    const now = new Date('2026-09-14T15:00:00.000Z');
    const settings = settingsDoc({
      maintenance: {
        enabled: false,
        message: 'Mensagem padrão da plataforma.',
        windows: [{
          _id: new Types.ObjectId(),
          startsAt: new Date('2026-09-14T14:00:00.000Z'),
          endsAt: new Date('2026-09-14T16:00:00.000Z'),
          message: 'Janela da tarde em andamento.',
        }],
      },
    });
    const status = toPublicPlatformStatus(settings as never, now);
    assert.equal(status.maintenance.enabled, true);
    assert.equal(status.maintenance.message, 'Janela da tarde em andamento.');
    const effective = resolveEffectiveMaintenance(settings as never, now);
    assert.equal(effective.source, 'window');
  });

  test('interruptor de manutenção prevalece sobre a janela', () => {
    const now = new Date('2026-09-14T15:00:00.000Z');
    const settings = settingsDoc({
      maintenance: {
        enabled: true,
        message: 'Aviso imediato da plataforma.',
        windows: [{
          _id: new Types.ObjectId(),
          startsAt: new Date('2026-09-14T14:00:00.000Z'),
          endsAt: new Date('2026-09-14T16:00:00.000Z'),
          message: 'Janela ignorada.',
        }],
      },
    });
    const effective = resolveEffectiveMaintenance(settings as never, now);
    assert.equal(effective.source, 'override');
    assert.equal(effective.message, 'Aviso imediato da plataforma.');
  });

  test('agenda recusa sobreposição, excesso e duração acima de 72 horas', async () => {
    const current = settingsDoc();
    stubMethod(PlatformSettings, 'findOne', async () => current);
    const base = {
      updatedAt: current.updatedAt.toISOString(),
      registrations: { enabled: true, approvalMode: 'automatic' },
      email: { senderName: 'Eclesiafy', senderAddress: 'acesso@notificacoes.eclesiafy.com.br', replyTo: '' },
      newChurchDefaults: {
        timezone: 'America/Sao_Paulo',
        visitorFollowUpEnabled: false,
        retention: { enabled: false, ...RETENTION_DEFAULTS },
      },
    };
    await assert.rejects(
      () => updatePlatformSettings({
        ...base,
        maintenance: {
          enabled: false,
          message: 'Atualização programada neste sábado.',
          windows: [
            { startsAt: '2026-09-14T10:00:00.000Z', endsAt: '2026-09-14T12:00:00.000Z', message: '' },
            { startsAt: '2026-09-14T11:00:00.000Z', endsAt: '2026-09-14T13:00:00.000Z', message: '' },
          ],
        },
      }),
      (error: unknown) => error instanceof PlatformSettingsError && /sobrepor/.test(error.message)
    );
    await assert.rejects(
      () => updatePlatformSettings({
        ...base,
        maintenance: {
          enabled: false,
          message: 'Atualização programada neste sábado.',
          windows: [{ startsAt: '2026-09-14T10:00:00.000Z', endsAt: '2026-09-17T11:00:00.000Z', message: '' }],
        },
      }),
      (error: unknown) => error instanceof PlatformSettingsError && /72/.test(error.message)
    );
    await assert.rejects(
      () => updatePlatformSettings({
        ...base,
        maintenance: {
          enabled: false,
          message: 'Atualização programada neste sábado.',
          windows: Array.from({ length: 6 }, (_, index) => ({
            startsAt: new Date(Date.UTC(2026, 8, 14, index * 3, 0, 0)).toISOString(),
            endsAt: new Date(Date.UTC(2026, 8, 14, index * 3 + 1, 0, 0)).toISOString(),
            message: '',
          })),
        },
      }),
      (error: unknown) => error instanceof PlatformSettingsError && /5/.test(error.message)
    );
  });

  test('e-mail de teste recusa destinatário e churchId', () => {
    parseSettingsTestEmailBody({});
    parseSettingsTestEmailBody(undefined);
    assert.throws(
      () => parseSettingsTestEmailBody({ to: 'outro@eclesiafy.com.br' }),
      (error: unknown) => error instanceof PlatformSettingsError && /destinatário/.test(error.message)
    );
    assert.throws(
      () => parseSettingsTestEmailBody({ churchId: 'abc' }),
      (error: unknown) => error instanceof PlatformSettingsError && /igreja/.test(error.message)
    );
  });

  test('URLs legais sanitizadas entram no público e limites não vazam', () => {
    const withLegal = toPublicPlatformStatus(settingsDoc({
      legal: {
        termsUrl: 'https://eclesiafy.com.br/termos',
        privacyUrl: 'https://eclesiafy.com.br/privacidade',
      },
      limits: { maxChurches: 12, maxPendingApprovals: 3 },
    }) as never);
    assert.deepEqual(withLegal.legal, {
      termsUrl: 'https://eclesiafy.com.br/termos',
      privacyUrl: 'https://eclesiafy.com.br/privacidade',
    });
    assert.equal(JSON.stringify(withLegal).includes('maxChurches'), false);
    assert.equal('limits' in withLegal, false);

    const emptyLegal = toPublicPlatformStatus(settingsDoc() as never);
    assert.equal('legal' in emptyLegal, false);
  });

  test('URL legal recusa query, hash e protocolo inválido', () => {
    assert.equal(parseLegalUrl('', 'O endereço dos termos'), '');
    assert.equal(parseLegalUrl('https://eclesiafy.com.br/termos/', 'O endereço dos termos'), 'https://eclesiafy.com.br/termos');
    assert.throws(
      () => parseLegalUrl('https://eclesiafy.com.br/termos?x=1', 'O endereço dos termos'),
      (error: unknown) => error instanceof PlatformSettingsError && /consulta/.test(error.message)
    );
    assert.throws(
      () => parseLegalUrl('javascript:alert(1)', 'O endereço dos termos'),
      (error: unknown) => error instanceof PlatformSettingsError
    );
    assert.throws(
      () => parseLegalUrl('https://eclesiafy.com.br/termos#secao', 'O endereço dos termos'),
      (error: unknown) => error instanceof PlatformSettingsError && /fragmento/.test(error.message)
    );
  });

  test('prazos de e-mail fora da faixa são recusados', async () => {
    const current = settingsDoc();
    stubMethod(PlatformSettings, 'findOne', async () => current);
    await assert.rejects(
      () => updatePlatformSettings({
        updatedAt: current.updatedAt.toISOString(),
        registrations: { enabled: true, approvalMode: 'automatic' },
        email: {
          senderName: 'Eclesiafy',
          senderAddress: 'acesso@notificacoes.eclesiafy.com.br',
          replyTo: '',
          ttl: { verificationMinutes: 1, resetMinutes: 30, resendSeconds: 60 },
        },
        newChurchDefaults: {
          timezone: 'America/Sao_Paulo',
          visitorFollowUpEnabled: false,
          retention: { enabled: false, ...RETENTION_DEFAULTS },
        },
        maintenance: { enabled: false, message: '', windows: [] },
      }),
      (error: unknown) => error instanceof PlatformSettingsError && /confirmação/.test((error as Error).message)
    );
  });

  test('prazos de e-mail usam o documento e caem no ambiente', async () => {
    stubMethod(PlatformSettings, 'findOne', async () => settingsDoc({
      email: {
        senderName: 'Eclesiafy',
        senderAddress: 'acesso@notificacoes.eclesiafy.com.br',
        replyTo: '',
        ttl: { verificationMinutes: 45, resetMinutes: 20, resendSeconds: 90 },
      },
    }));
    const ttl = await getEffectiveEmailTtl();
    assert.equal(ttl.verificationMs, 45 * 60_000);
    assert.equal(ttl.resetMs, 20 * 60_000);
    assert.equal(ttl.resendMs, 90_000);

    stubMethod(PlatformSettings, 'findOne', async () => {
      throw new Error('db down');
    });
    const fallback = await getEffectiveEmailTtl();
    assert.ok(fallback.verificationMs > 0);
    assert.ok(fallback.resetMs > 0);
  });

  test('capacidade da plataforma recusa novo cadastro', async () => {
    stubMethod(PlatformSettings, 'findOne', async () => settingsDoc({
      limits: { maxChurches: 2, maxPendingApprovals: null },
    }));
    stubMethod(Church, 'countDocuments', async () => 2);
    await assert.rejects(
      () => assertPlatformCanAcceptChurch(),
      (error: unknown) => (
        error instanceof PlatformSettingsError &&
        error.status === 403 &&
        error.code === PLATFORM_AT_CAPACITY_CODE
      )
    );

    stubMethod(PlatformSettings, 'findOne', async () => settingsDoc({
      registrations: { enabled: true, approvalMode: 'manual' },
      limits: { maxChurches: null, maxPendingApprovals: 1 },
    }));
    stubMethod(Church, 'countDocuments', async (_filter: object) => (
      'approvalStatus' in _filter ? 1 : 0
    ));
    await assert.rejects(() => assertPlatformCanAcceptChurch(), PlatformSettingsError);
  });

  test('aviso institucional sanitizado entra no público e módulos não vazam', () => {
    const withNotice = toPublicPlatformStatus(settingsDoc({
      notice: { enabled: true, message: 'Prazo de atualização cadastral nesta semana.', tone: 'warning' },
      newChurchDefaults: { visitorFollowUpEnabled: true, modules: { visitorFollowUpEnabled: true } },
    }) as never);
    assert.deepEqual(withNotice.notice, {
      enabled: true,
      message: 'Prazo de atualização cadastral nesta semana.',
      tone: 'warning',
    });
    assert.equal(JSON.stringify(withNotice).includes('visitorFollowUpEnabled'), false);
    assert.equal('modules' in withNotice, false);

    const off = toPublicPlatformStatus(settingsDoc({
      notice: { enabled: false, message: 'Texto guardado internamente.', tone: 'info' },
    }) as never);
    assert.equal('notice' in off, false);
  });

  test('aviso institucional recusa HTML e módulo inexistente', async () => {
    const current = settingsDoc();
    stubMethod(PlatformSettings, 'findOne', async () => current);
    const base = {
      updatedAt: current.updatedAt.toISOString(),
      registrations: { enabled: true, approvalMode: 'automatic' },
      email: { senderName: 'Eclesiafy', senderAddress: 'acesso@notificacoes.eclesiafy.com.br', replyTo: '' },
      newChurchDefaults: {
        timezone: 'America/Sao_Paulo',
        visitorFollowUpEnabled: false,
        retention: { enabled: false, ...RETENTION_DEFAULTS },
      },
      maintenance: { enabled: false, message: '', windows: [] },
    };
    await assert.rejects(
      () => updatePlatformSettings({
        ...base,
        notice: { enabled: true, message: '<b>aviso</b>', tone: 'info' },
      }),
      (error: unknown) => error instanceof PlatformSettingsError && /HTML/.test((error as Error).message)
    );
    await assert.rejects(
      () => updatePlatformSettings({
        ...base,
        newChurchDefaults: {
          ...base.newChurchDefaults,
          modules: { visitorFollowUpEnabled: true, prayerEnabled: true },
        },
      }),
      (error: unknown) => error instanceof PlatformSettingsError && /desconhecidas/.test((error as Error).message)
    );
  });

  test('módulo de acompanhamento da nova igreja copia o flag real', async () => {
    stubMethod(PlatformSettings, 'findOne', async () => settingsDoc({
      newChurchDefaults: {
        timezone: 'America/Manaus',
        visitorFollowUpEnabled: false,
        modules: { visitorFollowUpEnabled: true },
      },
    }));
    const plan = await getNewChurchCreationPlan();
    assert.equal(plan.visitorFollowUpEnabled, true);
    assert.equal(plan.timezone, 'America/Manaus');
  });
});
