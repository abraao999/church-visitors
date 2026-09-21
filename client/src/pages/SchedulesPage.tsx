import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AppIcon } from '../components/AppIcon';
import type {
  ScheduleAssignmentStatus,
  Service,
  ServiceSchedule,
  ServiceScheduleTeam,
  Volunteer,
  WorkTeam,
} from '../types';
import './SchedulesPage.css';

type Tab = 'services' | 'teams' | 'volunteers';

const STATUS_LABELS: Record<ScheduleAssignmentStatus, string> = {
  scheduled: 'Escalado',
  confirmed: 'Confirmou',
  declined: 'Não poderá',
  served: 'Serviu',
  absent: 'Faltou',
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function serviceDateLabel(service: Service) {
  const key = service.dateKey || service.date.split('T')[0] || service.date;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const label = Number.isNaN(date.getTime())
    ? key
    : date.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      });
  return `${label}${service.time ? ` • ${service.time}` : ''}`;
}

function emptySchedule(serviceId: string): ServiceSchedule {
  return { id: '', serviceId, teams: [] };
}

export function SchedulesPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes('schedules:manage') || user?.role === 'owner';
  const [activeTab, setActiveTab] = useState<Tab>('services');
  const [services, setServices] = useState<Service[]>([]);
  const [teams, setTeams] = useState<WorkTeam[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [schedule, setSchedule] = useState<ServiceSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [teamForm, setTeamForm] = useState({ name: '', leaderName: '', minVolunteers: 1 });
  const [volunteerForm, setVolunteerForm] = useState({ name: '', phone: '', teamId: '' });

  const selectedService = useMemo(
    () => services.find((service) => service._id === selectedServiceId) ?? null,
    [services, selectedServiceId]
  );

  const activeTeams = useMemo(() => teams.filter((team) => team.active), [teams]);
  const activeVolunteers = useMemo(() => volunteers.filter((volunteer) => volunteer.active), [volunteers]);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const today = new Date();
      const [nextServices, nextTeams, nextVolunteers] = await Promise.all([
        api.getServices({ from: isoDate(today), to: isoDate(addDays(today, 45)) }),
        api.getScheduleTeams(),
        api.getVolunteers(),
      ]);
      setServices(nextServices);
      setTeams(nextTeams);
      setVolunteers(nextVolunteers);
      setSelectedServiceId((current) => current || nextServices[0]?._id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar escalas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  const loadSchedule = useCallback(async (serviceId: string) => {
    if (!serviceId) {
      setSchedule(null);
      return;
    }
    try {
      const data = await api.getServiceSchedule(serviceId);
      setSchedule(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar escala do culto.');
    }
  }, []);

  useEffect(() => {
    loadSchedule(selectedServiceId);
  }, [loadSchedule, selectedServiceId]);

  async function persist(nextTeams: ServiceScheduleTeam[]) {
    if (!selectedServiceId || !canManage) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const next = await api.updateServiceSchedule(selectedServiceId, { teams: nextTeams });
      setSchedule(next);
      setMessage('Escala salva.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar escala.');
    } finally {
      setSaving(false);
    }
  }

  async function addTeamToSchedule(teamId: string) {
    const team = activeTeams.find((item) => item.id === teamId);
    if (!team || !selectedServiceId) return;
    const current = schedule ?? emptySchedule(selectedServiceId);
    if (current.teams.some((item) => item.teamId === team.id)) return;
    await persist([
      ...current.teams,
      {
        teamId: team.id,
        teamName: team.name,
        minVolunteers: team.minVolunteers,
        assignments: [],
      },
    ]);
  }

  async function removeTeamFromSchedule(teamId: string) {
    const current = schedule ?? emptySchedule(selectedServiceId);
    await persist(current.teams.filter((team) => team.teamId !== teamId));
  }

  async function addVolunteer(teamId: string, volunteerId: string) {
    const volunteer = activeVolunteers.find((item) => item.id === volunteerId);
    const current = schedule ?? emptySchedule(selectedServiceId);
    if (!volunteer) return;
    await persist(
      current.teams.map((team) => {
        if (team.teamId !== teamId || team.assignments.some((item) => item.volunteerId === volunteerId)) return team;
        return {
          ...team,
          assignments: [
            ...team.assignments,
            { volunteerId, volunteerName: volunteer.name, status: 'scheduled', note: '' },
          ],
        };
      })
    );
  }

  async function updateAssignment(teamId: string, volunteerId: string, status: ScheduleAssignmentStatus) {
    const current = schedule ?? emptySchedule(selectedServiceId);
    await persist(
      current.teams.map((team) =>
        team.teamId === teamId
          ? {
              ...team,
              assignments: team.assignments.map((assignment) =>
                assignment.volunteerId === volunteerId ? { ...assignment, status } : assignment
              ),
            }
          : team
      )
    );
  }

  async function removeVolunteer(teamId: string, volunteerId: string) {
    const current = schedule ?? emptySchedule(selectedServiceId);
    await persist(
      current.teams.map((team) =>
        team.teamId === teamId
          ? { ...team, assignments: team.assignments.filter((item) => item.volunteerId !== volunteerId) }
          : team
      )
    );
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teamForm.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const team = await api.createScheduleTeam(teamForm);
      setTeams((current) => [...current, team].sort((a, b) => a.name.localeCompare(b.name)));
      setTeamForm({ name: '', leaderName: '', minVolunteers: 1 });
      setMessage('Equipe criada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar equipe.');
    } finally {
      setSaving(false);
    }
  }

  async function createVolunteer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!volunteerForm.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const volunteer = await api.createVolunteer({
        name: volunteerForm.name,
        phone: volunteerForm.phone,
        teamIds: volunteerForm.teamId ? [volunteerForm.teamId] : [],
      });
      setVolunteers((current) => [...current, volunteer].sort((a, b) => a.name.localeCompare(b.name)));
      setVolunteerForm({ name: '', phone: '', teamId: '' });
      setMessage('Voluntário cadastrado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar voluntário.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="schedules-page">
      <header className="schedules-hero">
        <div>
          <span className="schedules-eyebrow">
            <AppIcon name="clipboard" /> Escalas
          </span>
          <h1>Escalas das equipes</h1>
          <p>Organize quem vai servir em cada culto, por equipe e com confirmação visual.</p>
        </div>
        <div className="schedules-hero-card">
          <strong>{activeTeams.length}</strong>
          <span>equipes ativas</span>
        </div>
      </header>

      <div className="schedules-tabs" role="tablist" aria-label="Áreas da escala">
        <button className={activeTab === 'services' ? 'active' : ''} onClick={() => setActiveTab('services')}>
          Por culto
        </button>
        <button className={activeTab === 'teams' ? 'active' : ''} onClick={() => setActiveTab('teams')}>
          Equipes
        </button>
        <button className={activeTab === 'volunteers' ? 'active' : ''} onClick={() => setActiveTab('volunteers')}>
          Voluntários
        </button>
      </div>

      {message && <p className="schedules-feedback success">{message}</p>}
      {error && <p className="schedules-feedback error">{error}</p>}

      {activeTab === 'services' && (
        <section className="schedules-service-layout">
          <aside className="schedules-card schedules-service-list">
            <h2>Próximos cultos</h2>
            {loading ? <p>Carregando...</p> : null}
            {!loading && services.length === 0 ? (
              <p className="schedules-muted">Nenhum culto futuro encontrado.</p>
            ) : (
              services.map((service) => (
                <button
                  key={service._id}
                  className={service._id === selectedServiceId ? 'active' : ''}
                  onClick={() => setSelectedServiceId(service._id)}
                >
                  <strong>{service.title}</strong>
                  <span>{serviceDateLabel(service)}</span>
                </button>
              ))
            )}
          </aside>

          <main className="schedules-card schedules-main-card">
            <div className="schedules-main-header">
              <div>
                <h2>{selectedService?.title ?? 'Selecione um culto'}</h2>
                <p>{selectedService ? serviceDateLabel(selectedService) : 'Escolha um culto para montar a escala.'}</p>
              </div>
              {canManage && activeTeams.length > 0 && selectedServiceId ? (
                <select
                  value=""
                  onChange={(event) => addTeamToSchedule(event.target.value)}
                  disabled={saving}
                >
                  <option value="">Adicionar equipe</option>
                  {activeTeams
                    .filter((team) => !schedule?.teams.some((item) => item.teamId === team.id))
                    .map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                </select>
              ) : null}
            </div>

            {schedule?.teams.length ? (
              <div className="schedule-team-grid">
                {schedule.teams.map((team) => {
                  const available = activeVolunteers.filter((volunteer) => volunteer.teamIds.includes(team.teamId));
                  const missing = Math.max(team.minVolunteers - team.assignments.length, 0);
                  return (
                    <article key={team.teamId} className="schedule-team-card">
                      <div className="schedule-team-title">
                        <div>
                          <strong>{team.teamName}</strong>
                          <span>
                            {team.assignments.length}/{team.minVolunteers} pessoas
                          </span>
                        </div>
                        {missing > 0 ? <em>faltam {missing}</em> : <em className="ok">completa</em>}
                      </div>

                      <div className="schedule-assignments">
                        {team.assignments.length === 0 ? (
                          <p className="schedules-muted">Nenhum voluntário escalado.</p>
                        ) : (
                          team.assignments.map((assignment) => (
                            <div key={assignment.volunteerId} className="schedule-assignment-row">
                              <span>{assignment.volunteerName}</span>
                              {canManage ? (
                                <select
                                  value={assignment.status}
                                  onChange={(event) =>
                                    updateAssignment(
                                      team.teamId,
                                      assignment.volunteerId,
                                      event.target.value as ScheduleAssignmentStatus
                                    )
                                  }
                                >
                                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <small>{STATUS_LABELS[assignment.status]}</small>
                              )}
                              {canManage ? (
                                <button onClick={() => removeVolunteer(team.teamId, assignment.volunteerId)}>
                                  Remover
                                </button>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>

                      {canManage ? (
                        <div className="schedule-team-actions">
                          <select value="" onChange={(event) => addVolunteer(team.teamId, event.target.value)}>
                            <option value="">Adicionar voluntário</option>
                            {available
                              .filter((volunteer) => !team.assignments.some((item) => item.volunteerId === volunteer.id))
                              .map((volunteer) => (
                                <option key={volunteer.id} value={volunteer.id}>
                                  {volunteer.name}
                                </option>
                              ))}
                          </select>
                          <button className="ghost-danger" onClick={() => removeTeamFromSchedule(team.teamId)}>
                            Tirar equipe
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="schedules-empty">
                <AppIcon name="clipboard" />
                <strong>Nenhuma equipe adicionada a este culto.</strong>
                <span>Adicione uma equipe para começar a montar a escala.</span>
              </div>
            )}
          </main>
        </section>
      )}

      {activeTab === 'teams' && (
        <section className="schedules-two-columns">
          {canManage ? (
            <form className="schedules-card schedules-form-card" onSubmit={createTeam}>
              <h2>Nova equipe</h2>
              <label>
                Nome da equipe
                <input value={teamForm.name} onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })} />
              </label>
              <label>
                Responsável
                <input value={teamForm.leaderName} onChange={(event) => setTeamForm({ ...teamForm, leaderName: event.target.value })} />
              </label>
              <label>
                Mínimo por culto
                <input
                  type="number"
                  min="1"
                  value={teamForm.minVolunteers}
                  onChange={(event) => setTeamForm({ ...teamForm, minVolunteers: Number(event.target.value) })}
                />
              </label>
              <button type="submit" disabled={saving}>Criar equipe</button>
            </form>
          ) : null}
          <div className="schedules-list-card">
            {teams.map((team) => (
              <article key={team.id} className="schedules-card schedules-list-item">
                <strong>{team.name}</strong>
                <span>{team.leaderName ? `Responsável: ${team.leaderName}` : 'Sem responsável definido'}</span>
                <small>Mínimo: {team.minVolunteers} por culto</small>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'volunteers' && (
        <section className="schedules-two-columns">
          {canManage ? (
            <form className="schedules-card schedules-form-card" onSubmit={createVolunteer}>
              <h2>Novo voluntário</h2>
              <label>
                Nome
                <input value={volunteerForm.name} onChange={(event) => setVolunteerForm({ ...volunteerForm, name: event.target.value })} />
              </label>
              <label>
                Telefone
                <input value={volunteerForm.phone} onChange={(event) => setVolunteerForm({ ...volunteerForm, phone: event.target.value })} />
              </label>
              <label>
                Equipe principal
                <select value={volunteerForm.teamId} onChange={(event) => setVolunteerForm({ ...volunteerForm, teamId: event.target.value })}>
                  <option value="">Selecione uma equipe</option>
                  {activeTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={saving}>Cadastrar voluntário</button>
            </form>
          ) : null}
          <div className="schedules-list-card">
            {volunteers.map((volunteer) => (
              <article key={volunteer.id} className="schedules-card schedules-list-item">
                <strong>{volunteer.name}</strong>
                <span>{volunteer.phone || 'Sem telefone'}</span>
                <small>
                  {volunteer.teamIds
                    .map((id) => teams.find((team) => team.id === id)?.name)
                    .filter(Boolean)
                    .join(', ') || 'Sem equipe'}
                </small>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
