import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { GuestAccess, GuestAccessType } from '../types';
import { AppIcon } from './AppIcon';
import { GuestAccessQr, guestAccessUrl } from './GuestAccessQr';
import './GuestAccessOverview.css';

const TYPES: Array<{
  type: GuestAccessType;
  title: string;
  permission: string;
  defaultName: string;
  createLabel: string;
  icon: 'users' | 'prayer' | 'car';
}> = [
  {
    type: 'visitors:create',
    title: 'Equipe da portaria',
    permission: 'Cadastrar visitantes',
    defaultName: 'Portaria — culto',
    createLabel: 'Gerar acesso da portaria',
    icon: 'users',
  },
  {
    type: 'prayers:create',
    title: 'Pedidos de oração',
    permission: 'Enviar pedidos',
    defaultName: 'Oração — transmissão',
    createLabel: 'Gerar acesso de oração',
    icon: 'prayer',
  },
  {
    type: 'vehicle_notices:create',
    title: 'Avisos de veículos',
    permission: 'Enviar avisos sobre veículos',
    defaultName: 'Estacionamento — culto',
    createLabel: 'Gerar acesso de veículos',
    icon: 'car',
  },
];

function isAvailable(access: GuestAccess): boolean {
  return access.active && (!access.expiresAt || new Date(access.expiresAt).getTime() > Date.now());
}

function labelDate(value?: string): string {
  if (!value) return 'Sem validade';
  return `Até ${new Intl.DateTimeFormat('pt-BR').format(new Date(value))}`;
}

export function GuestAccessOverview() {
  const [accesses, setAccesses] = useState<GuestAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyType, setBusyType] = useState<GuestAccessType | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setAccesses(await api.getGuestAccesses());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os acessos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const featured = useMemo(() => {
    return new Map(TYPES.map(({ type }) => {
      const matching = accesses.filter((access) => access.type === type);
      return [type, matching.find(isAvailable) || matching[0]];
    }));
  }, [accesses]);

  async function create(type: GuestAccessType, defaultName: string) {
    setBusyType(type);
    setError('');
    setFeedback('');
    try {
      const access = await api.createGuestAccess({ name: defaultName, type });
      setAccesses((current) => [access, ...current]);
      setFeedback(`Acesso “${access.name}” criado com segurança.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o acesso.');
    } finally {
      setBusyType(null);
    }
  }

  async function copy(access: GuestAccess) {
    setError('');
    try {
      await navigator.clipboard.writeText(guestAccessUrl(access.token));
      setFeedback(`Link de “${access.name}” copiado.`);
    } catch {
      setError('Não foi possível copiar o link automaticamente.');
    }
  }

  return (
    <section className="access-overview" aria-labelledby="access-overview-title">
      <div className="access-overview-heading">
        <div>
          <span className="access-overview-eyebrow"><AppIcon name="qr" /> Links e QR Codes</span>
          <h2 id="access-overview-title">Acessos sem login</h2>
          <p>Compartilhe somente a permissão necessária para cada equipe.</p>
        </div>
        <Link to="/acessos">Gerenciar todos <AppIcon name="arrow" /></Link>
      </div>

      <div className="access-overview-feedback" aria-live="polite">
        {feedback && <span className="success"><AppIcon name="check" />{feedback}</span>}
        {error && <span className="error" role="alert">{error}</span>}
      </div>

      <div className="access-overview-grid">
        {TYPES.map((item) => {
          const access = featured.get(item.type);
          const available = access ? isAvailable(access) : false;
          return (
            <article className="access-overview-card card" key={item.type}>
              <div className="access-overview-card-header">
                <span className={item.type === 'prayers:create' ? 'prayer' : ''}>
                  <AppIcon name={item.icon} />
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p>Permissão: {item.permission.toLowerCase()}</p>
                </div>
                {access && <strong className={available ? 'active' : 'inactive'}>{available ? 'Ativo' : 'Inativo'}</strong>}
              </div>

              {loading ? (
                <p className="access-overview-loading">Carregando...</p>
              ) : access ? (
                <div className="access-overview-content">
                  <GuestAccessQr token={access.token} name={access.name} size={142} />
                  <div className="access-overview-info">
                    <strong>{access.name}</strong>
                    <span><AppIcon name="calendar" />{labelDate(access.expiresAt)}</span>
                    <input value={guestAccessUrl(access.token)} readOnly aria-label={`Link de ${access.name}`} onFocus={(event) => event.currentTarget.select()} />
                    <button type="button" onClick={() => copy(access)}><AppIcon name="copy" />Copiar link</button>
                    <Link to="/acessos">Gerenciar acesso</Link>
                  </div>
                </div>
              ) : (
                <div className="access-overview-empty">
                  <AppIcon name="lock" />
                  <p>Nenhum link foi ativado para esta finalidade.</p>
                  <button type="button" onClick={() => create(item.type, item.defaultName)} disabled={busyType === item.type}>
                    <AppIcon name="plus" />
                    {busyType === item.type ? 'Gerando...' : item.createLabel}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
