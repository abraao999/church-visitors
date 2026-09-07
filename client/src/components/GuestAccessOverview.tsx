import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { GuestAccess, GuestAccessType } from '../types';
import { AppIcon } from './AppIcon';
import { GuestAccessQr, guestAccessUrl } from './GuestAccessQr';
import { OPTION_LABELS } from '../utils/publicAccess';
import './GuestAccessOverview.css';

const ALL_TYPES: GuestAccessType[] = [
  'visitors:create',
  'prayers:create',
  'vehicle_notices:create',
];

function isAvailable(access: GuestAccess): boolean {
  return access.active && (!access.expiresAt || new Date(access.expiresAt).getTime() > Date.now());
}

function accessTypes(access: GuestAccess): GuestAccessType[] {
  return access.types?.length ? access.types : access.type ? [access.type] : [];
}

/** Só o portal de formulários: acesso de painel é ferramenta da TV. */
function isPortal(access: GuestAccess): boolean {
  const types = accessTypes(access);
  return types.length > 1 && !types.includes('panels:read');
}

function labelDate(value?: string): string {
  if (!value) return 'Sem validade';
  return `Até ${new Intl.DateTimeFormat('pt-BR').format(new Date(value))}`;
}

export function GuestAccessOverview() {
  const [accesses, setAccesses] = useState<GuestAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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

  const portal = useMemo(() => {
    const unified = accesses.filter(isPortal);
    return unified.find(isAvailable) || unified[0];
  }, [accesses]);

  async function createPortal() {
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const access = await api.createGuestAccess({
        name: 'Portal público da igreja',
        types: ALL_TYPES,
      });
      setAccesses((current) => [access, ...current]);
      setFeedback('Portal público criado. O QR Code já pode ser compartilhado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o portal.');
    } finally {
      setBusy(false);
    }
  }

  async function copy(access: GuestAccess) {
    setError('');
    try {
      await navigator.clipboard.writeText(guestAccessUrl(access.token, accessTypes(access)));
      setFeedback(`Link de “${access.name}” copiado.`);
    } catch {
      setError('Não foi possível copiar o link automaticamente.');
    }
  }

  const available = portal ? isAvailable(portal) : false;

  return (
    <section className="access-overview" aria-labelledby="access-overview-title">
      <div className="access-overview-heading">
        <div>
          <span className="access-overview-eyebrow"><AppIcon name="qr" /> Links e QR Codes</span>
          <h2 id="access-overview-title">Portal público da igreja</h2>
          <p>Um único QR Code para visitantes, oração e avisos de veículos.</p>
        </div>
        <Link to="/acessos">Gerenciar todos <AppIcon name="arrow" /></Link>
      </div>

      <div className="access-overview-feedback" aria-live="polite">
        {feedback && <span className="success"><AppIcon name="check" />{feedback}</span>}
        {error && <span className="error" role="alert">{error}</span>}
      </div>

      <article className="access-overview-card card access-overview-portal">
        {loading ? (
          <p className="access-overview-loading">Carregando...</p>
        ) : portal ? (
          <div className="access-overview-content">
            <GuestAccessQr
              token={portal.token}
              name={portal.name}
              types={accessTypes(portal)}
              size={168}
            />
            <div className="access-overview-info">
              <div className="access-overview-card-header">
                <div>
                  <h3>{portal.name}</h3>
                  <p>{accessTypes(portal).map((type) => OPTION_LABELS[type]).join(' · ')}</p>
                </div>
                <strong className={available ? 'active' : 'inactive'}>
                  {available ? 'Ativo' : 'Inativo'}
                </strong>
              </div>
              <span><AppIcon name="calendar" />{labelDate(portal.expiresAt)}</span>
              <input
                value={guestAccessUrl(portal.token)}
                readOnly
                aria-label={`Link de ${portal.name}`}
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="access-overview-actions">
                <button type="button" onClick={() => copy(portal)}>
                  <AppIcon name="copy" />Copiar link
                </button>
                <Link to="/acessos">Gerenciar acesso</Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="access-overview-empty">
            <AppIcon name="lock" />
            <p>Nenhum portal público foi criado.</p>
            <button type="button" onClick={createPortal} disabled={busy}>
              <AppIcon name="plus" />
              {busy ? 'Gerando...' : 'Criar portal público'}
            </button>
          </div>
        )}
      </article>
    </section>
  );
}
