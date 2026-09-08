import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { ChurchSectionNav } from '../components/ChurchSectionNav';
import type { TeamInvitation, TeamMember, TeamOverview } from '../types';
import {
  DEFAULT_INVITE_TTL_DAYS,
  INVITABLE_ROLES,
  INVITE_TTL_DAYS,
  PERMISSION_GROUPS,
  TEAM_ROLE_ICONS,
  TEAM_ROLE_LABELS,
  TEAM_ROLE_SUMMARIES,
  hasPermission,
  permissionsForRole,
  type InvitableRole,
  type Permission,
  type TeamRole,
} from '../utils/permissions';
import { resolvePublicOrigin } from '../utils/publicOrigin';
import './TeamPage.css';

function inviteAbsoluteUrl(path: string): string {
  const { origin } = resolvePublicOrigin(window.location.origin, import.meta.env.VITE_PUBLIC_ORIGIN);
  return `${origin}${path}`;
}

function shareMessage(churchName: string, url: string, name: string, roleLabel: string): string {
  return `Olá${name ? `, ${name}` : ''}! Você foi convidado(a) para a equipe da ${churchName} como ${roleLabel}. Crie seu acesso neste link (válido por tempo limitado): ${url}`;
}

function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

function relativeAccess(iso?: string): string {
  if (!iso) return 'Ainda não entrou';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Agora';
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours} h`;
  return formatExpiry(iso);
}

export function TeamPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState<TeamOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [q, setQ] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('all');
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    const fromState = (location.state as { notice?: string } | null)?.notice;
    if (!fromState) return;
    setNotice(fromState);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQApplied(q.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    try {
      setData(await api.getTeam({ q: qApplied || undefined, role: role || undefined, status }));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a equipe.');
    } finally {
      setLoading(false);
    }
  }, [qApplied, role, status]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const canInvite = hasPermission(user?.permissions, 'team:invite') || user?.role === 'owner';
  const canUpdate = hasPermission(user?.permissions, 'team:update') || user?.role === 'owner';
  const churchName = data?.churchName || user?.churchName || 'igreja';

  return (
    <div className="team-page">
      <ChurchSectionNav />
      <header className="team-heading">
        <div>
          <span className="team-eyebrow">Pessoas e permissões</span>
          <h1>Equipe da igreja</h1>
          <p>Convide pessoas e escolha o que cada uma pode acessar.</p>
        </div>
        {canInvite && (
          <button type="button" className="btn btn-primary" onClick={() => setInviteOpen(true)}>
            <AppIcon name="plus" /> Convidar pessoa
          </button>
        )}
      </header>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}

      <section className="team-stats" aria-label="Resumo da equipe">
        <article className="card team-stat">
          <AppIcon name="users" />
          <strong>{loading ? '—' : data?.stats.activeMembers ?? 0}</strong>
          <span>Pessoas ativas</span>
        </article>
        <article className="card team-stat">
          <AppIcon name="link" />
          <strong>{loading ? '—' : data?.stats.pendingInvites ?? 0}</strong>
          <span>Convite pendente</span>
        </article>
        <article className="card team-stat">
          <AppIcon name="shield" />
          <strong>{data?.stats.roles ?? 5}</strong>
          <span>Funções disponíveis</span>
        </article>
      </section>

      <div className="team-filters">
        <label>
          <span className="sr-only">Buscar pessoa</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
          />
        </label>
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filtrar por função">
          <option value="">Todas as funções</option>
          {(Object.keys(TEAM_ROLE_LABELS) as TeamRole[]).map((key) => (
            <option key={key} value={key}>
              {TEAM_ROLE_LABELS[key]}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por situação">
          <option value="all">Todas as situações</option>
          <option value="active">Ativas</option>
          <option value="inactive">Desativadas</option>
          <option value="pending">Convites pendentes</option>
          <option value="expired">Convites expirados</option>
        </select>
      </div>

      <section className="card team-list team-list-people">
        <h2>Pessoas com acesso</h2>
        {loading ? (
          <p className="empty-state">Carregando...</p>
        ) : !data?.members.length ? (
          <p className="empty-state">Nenhuma pessoa encontrada.</p>
        ) : (
          <ul>
            {data.members.map((member) => (
              <MemberRow key={member.id} member={member} canUpdate={canUpdate} />
            ))}
          </ul>
        )}
      </section>

      {status !== 'inactive' && status !== 'active' && (
        <section className="card team-list">
          <h2>Convites pendentes</h2>
          {loading ? (
            <p className="empty-state">Carregando...</p>
          ) : !data?.invitations.length ? (
            <p className="empty-state">Nenhum convite pendente.</p>
          ) : (
            <ul>
              {data.invitations.map((invite) => (
                <InviteRow
                  key={invite.id}
                  invite={invite}
                  churchName={churchName}
                  canInvite={canInvite}
                  onChanged={load}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="team-security">
        <AppIcon name="lock" /> Cada pessoa visualiza somente as áreas permitidas da {churchName}.
      </p>

      {inviteOpen && (
        <InviteModal
          churchName={churchName}
          granter={user?.permissions || []}
          onClose={() => setInviteOpen(false)}
          onCreated={() => {
            setInviteOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function MemberRow({ member, canUpdate }: { member: TeamMember; canUpdate: boolean }) {
  const icon = TEAM_ROLE_ICONS[member.role] as AppIconName;
  return (
    <li className="team-row">
      <span className="team-avatar" aria-hidden="true">
        {member.name.slice(0, 2).toUpperCase()}
      </span>
      <div className="team-row-copy">
        <strong>{member.name}</strong>
        <small>{member.email}</small>
      </div>
      <span className="team-role-badge">
        <AppIcon name={icon} /> {member.roleLabel}
      </span>
      <span className={`team-status ${member.active ? 'active' : 'inactive'}`}>
        {member.active ? 'Ativo' : 'Desativado'}
      </span>
      <span className="team-meta">{member.you ? 'Você' : relativeAccess(member.lastSeenAt)}</span>
      {member.you ? (
        <span className="team-row-action team-row-action-placeholder" aria-hidden="true" />
      ) : (
        <Link to={`/igreja/equipe/${member.id}`} className="btn btn-secondary team-row-action">
          {canUpdate ? 'Gerenciar' : 'Ver'}
        </Link>
      )}
    </li>
  );
}

function InviteRow({
  invite,
  churchName,
  canInvite,
  onChanged,
}: {
  invite: TeamInvitation;
  churchName: string;
  canInvite: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);
  const url = invite.path ? inviteAbsoluteUrl(invite.path) : '';

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function renew() {
    if (!window.confirm('Gerar um novo link invalida o convite anterior. Continuar?')) return;
    setBusy('renew');
    try {
      await api.renewTeamInvitation(invite.id);
      onChanged();
    } finally {
      setBusy('');
    }
  }

  async function cancel() {
    if (!window.confirm('Cancelar este convite? O link deixa de funcionar.')) return;
    setBusy('cancel');
    try {
      await api.cancelTeamInvitation(invite.id);
      onChanged();
    } finally {
      setBusy('');
    }
  }

  const message = shareMessage(churchName, url, invite.name, invite.roleLabel);

  return (
    <li className="team-row">
      <span className="team-avatar" aria-hidden="true">
        {invite.name.slice(0, 2).toUpperCase()}
      </span>
      <div className="team-row-copy">
        <strong>{invite.name}</strong>
        <small>{invite.email || 'Sem e-mail'}</small>
      </div>
      <span className="team-role-badge">{invite.roleLabel}</span>
      <span className={`team-status ${invite.status}`}>
        {invite.status === 'pending' ? 'Pendente' : invite.status === 'expired' ? 'Expirado' : invite.status}
      </span>
      <span className="team-meta">
        {invite.status === 'expired' ? 'Expirou' : 'Expira'} {formatExpiry(invite.expiresAt)}
      </span>
      {canInvite && invite.status === 'pending' && url && (
        <div className="team-row-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void copy()} disabled={Boolean(busy)}>
            <AppIcon name="copy" /> {copied ? 'Copiado' : 'Copiar convite'}
          </button>
          <a className="btn btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
          <button type="button" className="btn btn-secondary" onClick={() => void renew()} disabled={Boolean(busy)}>
            {busy === 'renew' ? 'Gerando...' : 'Gerar novo'}
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void cancel()} disabled={Boolean(busy)}>
            Cancelar
          </button>
        </div>
      )}
    </li>
  );
}

function InviteModal({
  churchName,
  granter,
  onClose,
  onCreated,
}: {
  churchName: string;
  granter: readonly string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('portaria');
  const [ttlDays, setTtlDays] = useState(DEFAULT_INVITE_TTL_DAYS);
  const [customize, setCustomize] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>(permissionsForRole('portaria'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<TeamInvitation | null>(null);
  const [copied, setCopied] = useState(false);

  function selectRole(next: InvitableRole) {
    setRole(next);
    setPermissions(permissionsForRole(next));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const invite = await api.createTeamInvitation({
        name,
        email: email.trim() || undefined,
        role,
        ttlDays,
        permissions: customize ? permissions : undefined,
        permissionsCustomized: customize,
      });
      setCreated(invite);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível gerar o convite.');
    } finally {
      setSaving(false);
    }
  }

  const url = created?.path ? inviteAbsoluteUrl(created.path) : '';
  const message = created
    ? shareMessage(churchName, url, created.name, created.roleLabel)
    : '';

  return (
    <div className="team-modal-backdrop" onClick={onClose} role="presentation">
      <div className="team-modal card" role="dialog" aria-labelledby="invite-title" onClick={(e) => e.stopPropagation()}>
        {created ? (
          <>
            <header className="team-modal-head">
              <div>
                <h2 id="invite-title">Convite criado</h2>
                <p>
                  {created.name} · {created.roleLabel} · vale até {formatExpiry(created.expiresAt)}
                </p>
              </div>
              <button type="button" className="team-modal-close" onClick={onCreated} aria-label="Fechar">
                ×
              </button>
            </header>
            <label className="form-group">
              Link do convite
              <input readOnly value={url} />
            </label>
            <div className="team-modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                }}
              >
                <AppIcon name="copy" /> {copied ? 'Copiado' : 'Copiar convite'}
              </button>
              <a className="btn btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
                Enviar pelo WhatsApp
              </a>
              <a
                className="btn btn-secondary"
                href={`mailto:${created.email || ''}?subject=${encodeURIComponent(`Convite para a equipe da ${churchName}`)}&body=${encodeURIComponent(message)}`}
              >
                Enviar por e-mail
              </a>
              <button type="button" className="btn btn-secondary" onClick={onCreated}>
                Concluir
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)}>
            <header className="team-modal-head">
              <div>
                <h2 id="invite-title">Convidar pessoa</h2>
                <p>Defina quem será convidado e o que poderá acessar</p>
              </div>
              <button type="button" className="team-modal-close" onClick={onClose} aria-label="Fechar">
                ×
              </button>
            </header>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <div className="form-group">
              <label htmlFor="invite-name">Nome da pessoa</label>
              <input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
            </div>
            <div className="form-group">
              <label htmlFor="invite-email">E-mail (opcional)</label>
              <input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <p className="team-field-label">Escolha uma função</p>
            <div className="team-role-grid">
              {INVITABLE_ROLES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`team-role-card ${role === item ? 'selected' : ''}`}
                  onClick={() => selectRole(item)}
                >
                  <AppIcon name={TEAM_ROLE_ICONS[item] as AppIconName} />
                  <strong>{TEAM_ROLE_LABELS[item]}</strong>
                  <small>{TEAM_ROLE_SUMMARIES[item]}</small>
                </button>
              ))}
            </div>
            <button type="button" className="team-customize" onClick={() => setCustomize((open) => !open)}>
              Personalizar permissões
            </button>
            {customize && (
              <div className="team-permission-groups">
                {PERMISSION_GROUPS.map((group) => (
                  <fieldset key={group.title}>
                    <legend>{group.title}</legend>
                    {group.items
                      .filter((item) => granter.includes(item.key) || granter.length === 0)
                      .map((item) => (
                        <label key={item.key}>
                          <input
                            type="checkbox"
                            checked={permissions.includes(item.key)}
                            onChange={(e) => {
                              setPermissions((prev) =>
                                e.target.checked ? [...prev, item.key] : prev.filter((key) => key !== item.key)
                              );
                            }}
                          />
                          {item.label}
                        </label>
                      ))}
                  </fieldset>
                ))}
              </div>
            )}
            <div className="form-group">
              <label htmlFor="invite-ttl">Validade do convite</label>
              <select id="invite-ttl" value={ttlDays} onChange={(e) => setTtlDays(Number(e.target.value))}>
                {INVITE_TTL_DAYS.map((days) => (
                  <option key={days} value={days}>
                    {days === 1 ? '24 horas' : `${days} dias`}
                  </option>
                ))}
              </select>
            </div>
            <p className="team-security">
              <AppIcon name="lock" /> Este convite será de uso único. A igreja e a função não poderão ser alteradas pelo
              convidado.
            </p>
            <div className="team-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
                {saving ? 'Gerando...' : 'Gerar convite'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
