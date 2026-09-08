import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AppIcon } from '../components/AppIcon';
import { ChurchSectionNav } from '../components/ChurchSectionNav';
import type { TeamMember } from '../types';
import {
  INVITABLE_ROLES,
  PERMISSION_GROUPS,
  TEAM_ROLE_LABELS,
  TEAM_ROLE_SUMMARIES,
  hasPermission,
  permissionsForRole,
  type InvitableRole,
  type Permission,
} from '../utils/permissions';
import './TeamPage.css';

function formatWhen(iso?: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export function TeamMemberPage() {
  const { memberId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [member, setMember] = useState<TeamMember | null>(null);
  const [role, setRole] = useState<InvitableRole>('portaria');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [customize, setCustomize] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!success.startsWith('Alterações salvas')) return;
    const timer = window.setTimeout(() => {
      navigate('/igreja/equipe', { replace: true, state: { notice: success } });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [navigate, success]);

  useEffect(() => {
    if (!memberId) return;
    api
      .getTeamMember(memberId)
      .then((next) => {
        setMember(next);
        setRole((next.role === 'owner' ? 'admin' : next.role) as InvitableRole);
        setPermissions(next.permissions as Permission[]);
        setCustomize(next.permissionsCustomized);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar.'))
      .finally(() => setLoading(false));
  }, [memberId]);

  if (loading) return <p className="empty-state">Carregando...</p>;
  if (!member) {
    return (
      <div className="team-page">
        <ChurchSectionNav />
        <p className="error-message">{error || 'Pessoa não encontrada.'}</p>
        <Link to="/igreja/equipe">Voltar à equipe</Link>
      </div>
    );
  }

  const currentMember = member;
  const isOwnerMember = currentMember.role === 'owner';
  const canEdit =
    !isOwnerMember &&
    user?.id !== currentMember.id &&
    (user?.role === 'owner' || hasPermission(user?.permissions, 'team:update'));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId || !canEdit) return;
    setSaving(true);
    setError('');
    try {
      const saved = await api.updateTeamMember(memberId, {
        role,
        permissions: customize ? permissions : permissionsForRole(role),
        permissionsCustomized: customize,
      });
      setMember(saved);
      setSuccess('Alterações salvas. As sessões anteriores desta pessoa foram encerradas.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function revoke() {
    if (!memberId || !window.confirm('Encerrar as outras sessões desta pessoa?')) return;
    await api.revokeTeamMemberSessions(memberId);
    setSuccess('As outras sessões foram encerradas.');
  }

  async function toggleActive() {
    if (!memberId || !canEdit) return;
    const action = currentMember.active ? 'Desativar o acesso desta pessoa?' : 'Reativar o acesso?';
    if (!window.confirm(action)) return;
    const saved = currentMember.active
      ? await api.deactivateTeamMember(memberId)
      : await api.reactivateTeamMember(memberId);
    setMember(saved);
    setSuccess(saved.active ? 'Acesso reativado.' : 'Acesso desativado. As sessões foram encerradas.');
  }

  return (
    <div className="team-page">
      <ChurchSectionNav />
      <p>
        <Link to="/igreja/equipe">Equipe da igreja</Link> / {member.name}
      </p>
      <header className="team-heading">
        <div>
          <h1>Acesso de {member.name}</h1>
          <p>
            {canEdit
              ? 'Altere a função e as áreas que esta pessoa pode utilizar.'
              : 'Consulta o acesso desta pessoa.'}
          </p>
        </div>
      </header>

      <section className="card team-row" style={{ gridTemplateColumns: '44px 1fr auto auto' }}>
        <span className="team-avatar">{member.name.slice(0, 2).toUpperCase()}</span>
        <div className="team-row-copy">
          <strong>{member.name}</strong>
          <small>{member.email}</small>
        </div>
        <span className={`team-status ${member.active ? 'active' : 'inactive'}`}>
          {member.active ? 'Ativa' : 'Desativado'}
        </span>
        <span className="team-meta">
          <AppIcon name="clock" /> Último acesso: {relativeOrNever(member.lastSeenAt)}
        </span>
      </section>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {success && <p className="success-message">{success}</p>}

      <form className="card" onSubmit={(e) => void save(e)}>
        <h2>Função da equipe</h2>
        <p className="team-meta">Use uma função pronta para configurar as permissões.</p>
        <div className="team-role-grid">
          {INVITABLE_ROLES.map((item) => (
            <button
              key={item}
              type="button"
              className={`team-role-card ${role === item ? 'selected' : ''}`}
              disabled={!canEdit}
              onClick={() => {
                setRole(item);
                if (!customize) setPermissions(permissionsForRole(item));
              }}
            >
              <strong>{TEAM_ROLE_LABELS[item]}</strong>
              <small>{TEAM_ROLE_SUMMARIES[item]}</small>
            </button>
          ))}
        </div>

        <h2>Permissões</h2>
        <div className="team-permission-groups">
          {PERMISSION_GROUPS.map((group) => (
            <fieldset key={group.title}>
              <legend>{group.title}</legend>
              {group.items.map((item) => (
                <label key={item.key}>
                  <input
                    type="checkbox"
                    checked={permissions.includes(item.key)}
                    disabled={!canEdit}
                    onChange={(e) => {
                      setCustomize(true);
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

        {canEdit && (
          <div className="team-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/igreja/equipe')}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        )}
      </form>

      {canEdit && (
        <section className="card">
          <h2>Segurança da conta</h2>
          <div className="team-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void revoke()}>
              Encerrar outras sessões
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void toggleActive()}>
              {member.active ? 'Desativar acesso' : 'Reativar acesso'}
            </button>
          </div>
          <p className="team-meta">
            {member.active
              ? 'Ao desativar, esta pessoa não conseguirá entrar no sistema.'
              : 'O histórico de registros desta pessoa é preservado.'}
          </p>
        </section>
      )}

      {member.permissionsUpdatedByName && member.permissionsUpdatedAt && (
        <p className="team-meta">
          <AppIcon name="clock" /> Última alteração feita por {member.permissionsUpdatedByName},{' '}
          {formatWhen(member.permissionsUpdatedAt)}.
        </p>
      )}
    </div>
  );
}

function relativeOrNever(iso?: string): string {
  if (!iso) return 'ainda não entrou';
  return formatWhen(iso);
}
