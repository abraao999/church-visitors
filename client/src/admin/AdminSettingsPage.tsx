import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import { adminApi } from './adminApi';
import { useAdminAuth } from './AdminAuthContext';
import {
  PLATFORM_TIMEZONES,
  type PlatformNoticeTone,
  type PlatformRetentionDefaults,
  type PlatformSettings,
} from './adminTypes';
import './AdminSettingsPage.css';

const CLOSED_REGISTRATION_FALLBACK = 'Novos cadastros estão temporariamente indisponíveis.';
const MAX_MAINTENANCE_WINDOWS = 5;

type FormWindow = {
  key: string;
  id: string;
  startsAt: string;
  endsAt: string;
  message: string;
};

const RETENTION_FIELDS: Array<{
  key: keyof Omit<PlatformRetentionDefaults, 'enabled'>;
  label: string;
  unit: string;
  min: number;
  max: number;
}> = [
  { key: 'visitorsMonths', label: 'Visitantes', unit: 'meses', min: 1, max: 120 },
  { key: 'prayersDays', label: 'Pedidos de oração', unit: 'dias', min: 7, max: 730 },
  { key: 'vehicleNoticesDays', label: 'Avisos de veículos', unit: 'dias', min: 7, max: 365 },
  { key: 'guestAccessesDays', label: 'Acessos públicos', unit: 'dias', min: 7, max: 730 },
  { key: 'teamInvitationsDays', label: 'Convites da equipe', unit: 'dias', min: 7, max: 730 },
  { key: 'portariaDevicesDays', label: 'Dispositivos da portaria', unit: 'dias', min: 30, max: 1825 },
];

type FormState = {
  registrationsEnabled: boolean;
  approvalMode: 'automatic' | 'manual';
  closedMessage: string;
  senderName: string;
  senderAddress: string;
  replyTo: string;
  verificationMinutes: number;
  resetMinutes: number;
  resendSeconds: number;
  timezone: string;
  visitorFollowUpEnabled: boolean;
  retention: PlatformRetentionDefaults;
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
  windows: FormWindow[];
  maxChurches: string;
  maxPendingApprovals: string;
  termsUrl: string;
  privacyUrl: string;
  noticeEnabled: boolean;
  noticeMessage: string;
  noticeTone: PlatformNoticeTone;
};

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function defaultWindow(): FormWindow {
  const start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    key: `new-${start.getTime()}`,
    id: '',
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    message: '',
  };
}

function maintenancePreview(form: FormState): string {
  const now = Date.now();
  if (form.maintenanceEnabled) return 'Em vigor agora pelo interruptor.';
  const current = form.windows.find((window) => {
    const start = new Date(window.startsAt).getTime();
    const end = new Date(window.endsAt).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
  });
  if (current) return 'Em vigor agora pela agenda.';
  const next = [...form.windows]
    .filter((window) => new Date(window.startsAt).getTime() > now)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
  if (next) return `Próxima janela em ${formatDateTime(next.startsAt)}.`;
  return 'Nenhum aviso programado.';
}

function noticePreview(form: FormState): string {
  if (!form.noticeEnabled) return 'Desligado. Não aparece para as igrejas.';
  return form.noticeTone === 'warning'
    ? 'Em vigor agora, com tom de atenção.'
    : 'Em vigor agora, com tom informativo.';
}

function optionalLimit(value: number | null | undefined): string {
  return typeof value === 'number' && value > 0 ? String(value) : '';
}

function parseOptionalLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}

function toForm(data: PlatformSettings): FormState {
  return {
    registrationsEnabled: data.registrations?.enabled !== false,
    approvalMode: data.registrations?.approvalMode === 'manual' ? 'manual' : 'automatic',
    closedMessage: data.registrations?.closedMessage || '',
    senderName: data.email?.senderName || 'Eclesiafy',
    senderAddress: data.email?.senderAddress || '',
    replyTo: data.email?.replyTo || '',
    verificationMinutes: data.email?.ttl?.verificationMinutes || 30,
    resetMinutes: data.email?.ttl?.resetMinutes || 30,
    resendSeconds: data.email?.ttl?.resendSeconds || 60,
    timezone: data.newChurchDefaults?.timezone || 'America/Sao_Paulo',
    visitorFollowUpEnabled: data.newChurchDefaults?.modules?.visitorFollowUpEnabled
      ?? data.newChurchDefaults?.visitorFollowUpEnabled === true,
    retention: { ...(data.newChurchDefaults?.retention || {
      enabled: false,
      visitorsMonths: 24,
      prayersDays: 90,
      vehicleNoticesDays: 30,
      guestAccessesDays: 90,
      teamInvitationsDays: 90,
      portariaDevicesDays: 180,
    }) },
    maintenanceEnabled: data.maintenance?.enabled === true,
    maintenanceMessage: data.maintenance?.message || '',
    windows: (data.maintenance?.windows || []).map((window, index) => ({
      key: window.id || `window-${index}`,
      id: window.id || '',
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      message: window.message || '',
    })),
    maxChurches: optionalLimit(data.limits?.maxChurches),
    maxPendingApprovals: optionalLimit(data.limits?.maxPendingApprovals),
    termsUrl: data.legal?.termsUrl || '',
    privacyUrl: data.legal?.privacyUrl || '',
    noticeEnabled: data.notice?.enabled === true,
    noticeMessage: data.notice?.message || '',
    noticeTone: data.notice?.tone === 'warning' ? 'warning' : 'info',
  };
}

function formKey(form: FormState): string {
  return JSON.stringify(form);
}

function AdminSwitch({
  id,
  checked,
  disabled,
  title,
  description,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  title: string;
  description: string;
  onCheckedChange?: (next: boolean) => void;
}) {
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  return (
    <label className={`admin-switch${checked ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`} htmlFor={id}>
      <span className="admin-switch-control">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-checked={checked}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onChange={(event) => onCheckedChange?.(event.target.checked === true)}
        />
        <span className="admin-switch-track" aria-hidden="true" />
        <span className="admin-switch-state" aria-hidden="true">
          {checked ? 'SIM' : 'NÃO'}
        </span>
      </span>
      <span className="admin-switch-copy">
        <strong id={titleId}>{title}</strong>
        <small id={descriptionId}>{description}</small>
      </span>
    </label>
  );
}

export function AdminSettingsPage() {
  const headingId = useId();
  const navigate = useNavigate();
  const { admin } = useAdminAuth();
  const [data, setData] = useState<PlatformSettings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [savedKey, setSavedKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const dirty = Boolean(form && savedKey && formKey(form) !== savedKey);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setStatus('');
    setTestStatus('');
    try {
      const settings = await adminApi.getSettings();
      const next = toForm(settings);
      setData(settings);
      setForm(next);
      setSavedKey(formKey(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as configurações.');
      setData(null);
      setForm(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) {
      setPendingHref(null);
      return;
    }
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || /^(mailto|tel):/i.test(href)) return;
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (`${url.pathname}${url.search}${url.hash}` === `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(`${url.pathname}${url.search}${url.hash}`);
    }
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty]);

  const timezoneOptions = useMemo(() => {
    const known = PLATFORM_TIMEZONES.map((item) => item.value as string);
    if (form?.timezone && !known.includes(form.timezone)) {
      return [...PLATFORM_TIMEZONES, { value: form.timezone, label: form.timezone }];
    }
    return PLATFORM_TIMEZONES;
  }, [form?.timezone]);

  function discard() {
    if (!data) return;
    const next = toForm(data);
    setForm(next);
    setSavedKey(formKey(next));
    setError('');
    setStatus('');
    setPendingHref(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!data || !form) return;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const saved = await adminApi.updateSettings({
        updatedAt: data.updatedAt,
        registrations: {
          enabled: form.registrationsEnabled,
          requireEmailConfirmation: true,
          approvalMode: form.approvalMode,
          closedMessage: form.closedMessage,
        },
        email: {
          senderName: form.senderName,
          senderAddress: form.senderAddress,
          replyTo: form.replyTo,
          ttl: {
            verificationMinutes: form.verificationMinutes,
            resetMinutes: form.resetMinutes,
            resendSeconds: form.resendSeconds,
          },
        },
        newChurchDefaults: {
          timezone: form.timezone,
          visitorFollowUpEnabled: form.visitorFollowUpEnabled,
          modules: {
            visitorFollowUpEnabled: form.visitorFollowUpEnabled,
          },
          retention: form.retention,
        },
        maintenance: {
          enabled: form.maintenanceEnabled,
          message: form.maintenanceMessage,
          windows: form.windows.map((window) => ({
            ...(window.id ? { id: window.id } : {}),
            startsAt: window.startsAt,
            endsAt: window.endsAt,
            message: window.message,
          })),
        },
        limits: {
          maxChurches: parseOptionalLimit(form.maxChurches),
          maxPendingApprovals: parseOptionalLimit(form.maxPendingApprovals),
        },
        legal: {
          termsUrl: form.termsUrl,
          privacyUrl: form.privacyUrl,
        },
        notice: {
          enabled: form.noticeEnabled,
          message: form.noticeMessage,
          tone: form.noticeTone,
        },
      });
      const next = toForm(saved);
      setData(saved);
      setForm(next);
      setSavedKey(formKey(next));
      setStatus('Configurações salvas.');
      setPendingHref(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'settings_conflict') {
        setError('As configurações foram alteradas por outro administrador. Atualize a página antes de salvar.');
      } else {
        setError(err instanceof Error ? err.message : 'Não foi possível salvar as configurações.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!form || dirty) return;
    setSendingTest(true);
    setError('');
    setTestStatus('');
    try {
      await adminApi.sendTestEmail();
      setTestStatus(`E-mail de teste enviado para ${admin?.email || 'o seu usuário'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o e-mail de teste.');
    } finally {
      setSendingTest(false);
    }
  }

  if (loading) return <p className="admin-boot">Carregando configurações...</p>;
  if (error && !form) {
    return (
      <div className="card admin-error" role="alert">
        <p>{error}</p>
        <button type="button" className="btn btn-primary" onClick={() => void load()}>
          Tentar novamente
        </button>
      </div>
    );
  }
  if (!form || !data) return <p className="card admin-empty">Configurações não encontradas.</p>;

  return (
    <form className="admin-settings" onSubmit={(event) => void save(event)} noValidate>
      <div className="admin-page-heading">
        <div>
          <h1 id={headingId}>Configurações da plataforma</h1>
          <p>Defina como novos cadastros e comunicações da Eclesiafy funcionarão.</p>
        </div>
        <span className="admin-badge">Administrador principal</span>
      </div>

      {error && <p className="error-message" role="alert">{error}</p>}
      {status && <p className="admin-boot" role="status">{status}</p>}
      {dirty && (
        <p className="admin-settings-dirty" role="status">
          Há alterações não salvas.
        </p>
      )}

      <section className="admin-section">
        <h2>Cadastro de igrejas</h2>
        <p>Controla o cadastro público de novos proprietários. Contas já iniciadas continuam podendo confirmar o e-mail.</p>
        <AdminSwitch
          id="registrations-enabled"
          checked={form.registrationsEnabled}
          title="Permitir novos cadastros"
          description={
            form.registrationsEnabled
              ? 'A aba “Criar conta” permanece visível na página de login.'
              : 'Visitantes veem apenas a entrada e uma mensagem de indisponibilidade.'
          }
          onCheckedChange={(enabled) => setForm((current) => current && { ...current, registrationsEnabled: enabled })}
        />
        <AdminSwitch
          id="require-email"
          checked
          disabled
          title="Exigir confirmação de e-mail"
          description="Política de segurança obrigatória"
        />
        <fieldset className="admin-settings-fieldset">
          <legend>Liberação de novas igrejas</legend>
          <label className="admin-settings-radio">
            <input
              type="radio"
              name="approvalMode"
              checked={form.approvalMode === 'automatic'}
              onChange={() => setForm((current) => current && { ...current, approvalMode: 'automatic' })}
            />
            <span>
              <strong>Ativação automática após confirmar o e-mail</strong>
              <small>Preserva o fluxo atual: a igreja já entra disponível.</small>
            </span>
          </label>
          <label className="admin-settings-radio">
            <input
              type="radio"
              name="approvalMode"
              checked={form.approvalMode === 'manual'}
              onChange={() => setForm((current) => current && { ...current, approvalMode: 'manual' })}
            />
            <span>
              <strong>Aprovação manual do administrador</strong>
              <small>A igreja é criada, mas o acesso espera a sua liberação.</small>
            </span>
          </label>
        </fieldset>
        <div className="form-group">
          <label htmlFor="closed-message">Mensagem quando o cadastro estiver fechado</label>
          <textarea
            id="closed-message"
            value={form.closedMessage}
            maxLength={180}
            rows={3}
            onChange={(event) => setForm((current) => current && { ...current, closedMessage: event.target.value })}
          />
          <small>
            {form.closedMessage.length}/180 · texto simples, sem HTML. Em branco, a tela de login usa:
            {' '}
            {CLOSED_REGISTRATION_FALLBACK}
          </small>
        </div>
      </section>

      <section className="admin-section">
        <h2>Limites da plataforma</h2>
        <p>Teto operacional global. Em branco, o cadastro permanece ilimitado. Isso não aparece no status público.</p>
        <div className="admin-settings-grid">
          <div className="form-group">
            <label htmlFor="max-churches">Máximo de igrejas</label>
            <input
              id="max-churches"
              type="number"
              min={1}
              max={10000}
              step={1}
              inputMode="numeric"
              placeholder="Ilimitado"
              value={form.maxChurches}
              onChange={(event) => setForm((current) => current && { ...current, maxChurches: event.target.value })}
            />
            <small>1 a 10.000. Vale para cadastro público e cadastro assistido.</small>
          </div>
          <div className="form-group">
            <label htmlFor="max-pending">Máximo de aprovações pendentes</label>
            <input
              id="max-pending"
              type="number"
              min={1}
              max={500}
              step={1}
              inputMode="numeric"
              placeholder="Ilimitado"
              value={form.maxPendingApprovals}
              onChange={(event) => setForm((current) => current && { ...current, maxPendingApprovals: event.target.value })}
            />
            <small>1 a 500. Só entra em vigor com aprovação manual.</small>
          </div>
        </div>
      </section>

      <section className="admin-section">
        <h2>Comunicação por e-mail</h2>
        <p>Nome e endereço são montados no cabeçalho From. As chaves continuam nas variáveis da Vercel.</p>
        <div className="admin-settings-grid">
          <div className="form-group">
            <label htmlFor="sender-name">Nome do remetente</label>
            <input
              id="sender-name"
              value={form.senderName}
              maxLength={80}
              required
              autoComplete="off"
              onChange={(event) => setForm((current) => current && { ...current, senderName: event.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="sender-address">E-mail do remetente</label>
            <input
              id="sender-address"
              type="email"
              value={form.senderAddress}
              maxLength={254}
              required
              autoComplete="off"
              onChange={(event) => setForm((current) => current && { ...current, senderAddress: event.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="reply-to">E-mail para respostas</label>
            <input
              id="reply-to"
              type="email"
              value={form.replyTo}
              maxLength={254}
              autoComplete="off"
              onChange={(event) => setForm((current) => current && { ...current, replyTo: event.target.value })}
            />
          </div>
        </div>
        <div className="admin-settings-grid">
          <div className="form-group">
            <label htmlFor="ttl-verification">Validade do código de confirmação (minutos)</label>
            <input
              id="ttl-verification"
              type="number"
              min={5}
              max={120}
              step={1}
              required
              value={form.verificationMinutes}
              onChange={(event) =>
                setForm((current) => current && { ...current, verificationMinutes: Number(event.target.value) })
              }
            />
            <small>5 a 120. Códigos já enviados não mudam de prazo.</small>
          </div>
          <div className="form-group">
            <label htmlFor="ttl-reset">Validade do link de senha (minutos)</label>
            <input
              id="ttl-reset"
              type="number"
              min={5}
              max={120}
              step={1}
              required
              value={form.resetMinutes}
              onChange={(event) =>
                setForm((current) => current && { ...current, resetMinutes: Number(event.target.value) })
              }
            />
            <small>5 a 120.</small>
          </div>
          <div className="form-group">
            <label htmlFor="ttl-resend">Intervalo entre reenvios (segundos)</label>
            <input
              id="ttl-resend"
              type="number"
              min={30}
              max={300}
              step={1}
              required
              value={form.resendSeconds}
              onChange={(event) =>
                setForm((current) => current && { ...current, resendSeconds: Number(event.target.value) })
              }
            />
            <small>30 a 300.</small>
          </div>
        </div>
        <div className="admin-detail-row">
          <span>Resend</span>
          <strong>{data.email.resendStatus === 'verified' ? 'Domínio de envio verificado' : 'Não configurado'}</strong>
        </div>
        <div className="admin-detail-row">
          <span>Endereço público da aplicação</span>
          <strong>{data.email.appOrigin || 'Não informado'}</strong>
        </div>
        <div className="admin-settings-test">
          <button
            type="button"
            className="btn"
            disabled={dirty || saving || sendingTest || data.email.resendStatus !== 'verified'}
            onClick={() => void sendTest()}
          >
            <AppIcon name="mail" />
            {sendingTest ? 'Enviando...' : 'Enviar e-mail de teste'}
          </button>
          <small>
            {data.email.resendStatus !== 'verified'
              ? 'O Resend precisa estar configurado no servidor.'
              : dirty
                ? 'Salve as configurações antes de enviar o teste.'
                : `O envio usa o remetente salvo e vai para ${admin?.email || 'o seu e-mail de administrador'}.`}
          </small>
          {testStatus && <p className="admin-boot" role="status">{testStatus}</p>}
        </div>
      </section>

      <section className="admin-section">
        <h2>Páginas legais</h2>
        <p>Aparecem no login e no cadastro quando preenchidas. O texto jurídico não é armazenado aqui.</p>
        <div className="admin-settings-grid">
          <div className="form-group">
            <label htmlFor="terms-url">URL dos termos de uso</label>
            <input
              id="terms-url"
              type="url"
              value={form.termsUrl}
              maxLength={500}
              autoComplete="off"
              placeholder="https://eclesiafy.com.br/termos"
              onChange={(event) => setForm((current) => current && { ...current, termsUrl: event.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="privacy-url">URL da privacidade</label>
            <input
              id="privacy-url"
              type="url"
              value={form.privacyUrl}
              maxLength={500}
              autoComplete="off"
              placeholder="https://eclesiafy.com.br/privacidade"
              onChange={(event) => setForm((current) => current && { ...current, privacyUrl: event.target.value })}
            />
          </div>
        </div>
        <small>HTTPS absoluto, sem consulta nem fragmento. Em branco, o link não é exibido.</small>
      </section>

      <section className="admin-section">
        <h2>Padrões para novas igrejas</h2>
        <p>Valem somente para igrejas criadas depois de salvar. As existentes não são alteradas.</p>
        <div className="form-group">
          <label htmlFor="timezone">Fuso horário inicial</label>
          <select
            id="timezone"
            value={form.timezone}
            onChange={(event) => setForm((current) => current && { ...current, timezone: event.target.value })}
          >
            {timezoneOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-settings-modules">
          <h3>Módulos da nova igreja</h3>
          <p>Só entram flags que já existem na igreja. Cópia única na criação. Não desliga nada em igrejas já cadastradas.</p>
          <AdminSwitch
            id="follow-up-default"
            checked={form.visitorFollowUpEnabled}
            title="Acompanhamento de visitantes inicialmente ativado"
            description="A igreja pode alterar esse recurso depois nas próprias configurações."
            onCheckedChange={(enabled) => setForm((current) => current && { ...current, visitorFollowUpEnabled: enabled })}
          />
        </div>
        <div className="admin-settings-retention">
          <div>
            <h3>Política inicial de retenção</h3>
            <p>{form.retention.enabled ? 'Política automática inicialmente ligada.' : 'Política automática inicialmente desligada.'}</p>
            <ul>
              {RETENTION_FIELDS.map((field) => (
                <li key={field.key}>
                  {field.label}: {form.retention[field.key]} {field.unit}
                </li>
              ))}
            </ul>
          </div>
          <button type="button" className="btn" onClick={() => setRetentionOpen(true)}>
            <AppIcon name="edit" />
            Editar prazos
          </button>
        </div>
      </section>

      <section className="admin-section">
        <h2>Aviso institucional</h2>
        <p>Recado informativo para as igrejas: comunicado, prazo ou orientação. Não implica instabilidade e não agenda sozinho.</p>
        <p className="admin-settings-preview" role="status">{noticePreview(form)}</p>
        <AdminSwitch
          id="notice-enabled"
          checked={form.noticeEnabled}
          title="Exibir aviso institucional agora"
          description="Aparece no login e no topo das áreas autenticadas das igrejas. Se a manutenção também estiver ligada, o banner de manutenção fica acima. Não aparece no painel administrativo, nas TVs, no OBS, no QR Code nem na portaria."
          onCheckedChange={(enabled) => setForm((current) => current && { ...current, noticeEnabled: enabled })}
        />
        <fieldset className="admin-settings-fieldset">
          <legend>Tom</legend>
          <label className="admin-settings-radio">
            <input
              type="radio"
              name="noticeTone"
              checked={form.noticeTone === 'info'}
              onChange={() => setForm((current) => current && { ...current, noticeTone: 'info' })}
            />
            <span>
              <strong>Informativo</strong>
              <small>Comunicado sem urgência operacional.</small>
            </span>
          </label>
          <label className="admin-settings-radio">
            <input
              type="radio"
              name="noticeTone"
              checked={form.noticeTone === 'warning'}
              onChange={() => setForm((current) => current && { ...current, noticeTone: 'warning' })}
            />
            <span>
              <strong>Atenção</strong>
              <small>Prazo ou orientação que precisa ser notada, sem ser manutenção.</small>
            </span>
          </label>
        </fieldset>
        <div className="form-group">
          <label htmlFor="notice-message">Mensagem</label>
          <textarea
            id="notice-message"
            value={form.noticeMessage}
            maxLength={180}
            minLength={form.noticeEnabled ? 10 : undefined}
            required={form.noticeEnabled}
            rows={3}
            onChange={(event) => setForm((current) => current && { ...current, noticeMessage: event.target.value })}
          />
          <small>{form.noticeMessage.length}/180 · texto simples, sem HTML.</small>
        </div>
      </section>

      <section className="admin-section">
        <h2>Manutenção programada</h2>
        <p>O aviso não bloqueia o sistema. Ele aparece só no topo das áreas autenticadas das igrejas.</p>
        <p className="admin-settings-preview" role="status">{maintenancePreview(form)}</p>
        <AdminSwitch
          id="maintenance-enabled"
          checked={form.maintenanceEnabled}
          title="Exibir aviso de manutenção agora"
          description="Liga o aviso imediatamente, mesmo fora de uma janela. Não aparece no painel administrativo, nas TVs, no OBS, no QR Code nem na portaria."
          onCheckedChange={(enabled) => setForm((current) => current && { ...current, maintenanceEnabled: enabled })}
        />
        <div className="form-group">
          <label htmlFor="maintenance-message">Mensagem padrão do aviso</label>
          <textarea
            id="maintenance-message"
            value={form.maintenanceMessage}
            maxLength={180}
            minLength={form.maintenanceEnabled || form.windows.length > 0 ? 10 : undefined}
            required={form.maintenanceEnabled || form.windows.length > 0}
            rows={3}
            onChange={(event) => setForm((current) => current && { ...current, maintenanceMessage: event.target.value })}
          />
          <small>{form.maintenanceMessage.length}/180 · texto simples, sem HTML. Janelas sem mensagem própria usam este texto.</small>
        </div>
        <div className="admin-settings-windows">
          <div className="admin-settings-windows-head">
            <h3>Agenda</h3>
            <button
              type="button"
              className="btn"
              disabled={form.windows.length >= MAX_MAINTENANCE_WINDOWS}
              onClick={() => setForm((current) => current && { ...current, windows: [...current.windows, defaultWindow()] })}
            >
              <AppIcon name="plus" />
              Adicionar janela
            </button>
          </div>
          <p>Até 5 janelas, sem sobreposição, com no máximo 72 horas cada. O horário segue o relógio deste dispositivo.</p>
          {form.windows.length === 0 ? (
            <p className="admin-empty">Nenhuma janela agendada.</p>
          ) : (
            <ul>
              {form.windows.map((window) => (
                <li key={window.key}>
                  <div className="admin-settings-grid">
                    <div className="form-group">
                      <label htmlFor={`window-start-${window.key}`}>Início</label>
                      <input
                        id={`window-start-${window.key}`}
                        type="datetime-local"
                        required
                        value={toDatetimeLocal(window.startsAt)}
                        onChange={(event) => {
                          const startsAt = fromDatetimeLocal(event.target.value) || window.startsAt;
                          setForm((current) =>
                            current && {
                              ...current,
                              windows: current.windows.map((item) =>
                                item.key === window.key ? { ...item, startsAt } : item
                              ),
                            }
                          );
                        }}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor={`window-end-${window.key}`}>Término</label>
                      <input
                        id={`window-end-${window.key}`}
                        type="datetime-local"
                        required
                        value={toDatetimeLocal(window.endsAt)}
                        onChange={(event) => {
                          const endsAt = fromDatetimeLocal(event.target.value) || window.endsAt;
                          setForm((current) =>
                            current && {
                              ...current,
                              windows: current.windows.map((item) =>
                                item.key === window.key ? { ...item, endsAt } : item
                              ),
                            }
                          );
                        }}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor={`window-message-${window.key}`}>Mensagem desta janela (opcional)</label>
                    <textarea
                      id={`window-message-${window.key}`}
                      value={window.message}
                      maxLength={180}
                      rows={2}
                      onChange={(event) => {
                        const message = event.target.value;
                        setForm((current) =>
                          current && {
                            ...current,
                            windows: current.windows.map((item) =>
                              item.key === window.key ? { ...item, message } : item
                            ),
                          }
                        );
                      }}
                    />
                    <small>{window.message.length}/180</small>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      setForm((current) =>
                        current && { ...current, windows: current.windows.filter((item) => item.key !== window.key) }
                      )
                    }
                  >
                    <AppIcon name="trash" />
                    Remover janela
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="admin-settings-actions">
        <button type="button" className="btn" disabled={!dirty || saving} onClick={discard}>
          Descartar alterações
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || !dirty}>
          <AppIcon name="check" />
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </div>

      {retentionOpen && (
        <div className="admin-dialog-backdrop" role="presentation" onClick={() => setRetentionOpen(false)}>
          <div
            className="card admin-dialog"
            role="dialog"
            aria-labelledby={`${headingId}-retention`}
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={`${headingId}-retention`}>Editar prazos</h2>
            <p>Os limites são os mesmos da política de retenção das igrejas.</p>
            <AdminSwitch
              id="retention-enabled"
              checked={form.retention.enabled}
              title="Política automática inicialmente ligada"
              description="A igreja pode alterar depois. Isso não atualiza igrejas já criadas."
              onCheckedChange={(enabled) =>
                setForm((current) => current && { ...current, retention: { ...current.retention, enabled } })
              }
            />
            {RETENTION_FIELDS.map((field) => (
              <div className="form-group" key={field.key}>
                <label htmlFor={`retention-${field.key}`}>
                  {field.label} ({field.unit})
                </label>
                <input
                  id={`retention-${field.key}`}
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={1}
                  required
                  value={form.retention[field.key]}
                  onChange={(event) =>
                    setForm((current) =>
                      current && {
                        ...current,
                        retention: {
                          ...current.retention,
                          [field.key]: Number(event.target.value),
                        },
                      }
                    )
                  }
                />
              </div>
            ))}
            <div className="admin-actions">
              <button type="button" className="btn btn-primary" onClick={() => setRetentionOpen(false)}>
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingHref && (
        <div className="admin-dialog-backdrop" role="presentation">
          <div className="card admin-dialog" role="dialog" aria-modal="true" aria-labelledby={`${headingId}-leave`}>
            <h2 id={`${headingId}-leave`}>Sair sem salvar?</h2>
            <p>Há alterações não salvas nas configurações da plataforma.</p>
            <div className="admin-actions">
              <button type="button" className="btn" onClick={() => setPendingHref(null)}>
                Continuar editando
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const href = pendingHref;
                  setPendingHref(null);
                  navigate(href);
                }}
              >
                Descartar e sair
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
