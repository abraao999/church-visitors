import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { GuestAccess } from '../types';
import {
  findLivePrayerAccess,
  LIVE_PRAYER_ACCESS_NAME,
  LIVE_PRAYER_TYPES,
} from '../utils/publicAccess';
import { resolvePublicOrigin } from '../utils/publicOrigin';
import { hasPermission } from '../utils/permissions';
import { AppIcon } from './AppIcon';
import {
  downloadGuestQrPng,
  GuestAccessQr,
  livePrayerFormUrl,
  livePrayerObsUrl,
} from './GuestAccessQr';
import './LivePrayerAccessCard.css';

function currentLinkIsLocal() {
  return resolvePublicOrigin(window.location.origin, import.meta.env.VITE_PUBLIC_ORIGIN).local;
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function LivePrayerAccessCard() {
  const { user } = useAuth();
  const canCreate = hasPermission(user?.permissions, 'guest_accesses:create') || user?.role === 'owner';
  const [accesses, setAccesses] = useState<GuestAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setAccesses(await api.getGuestAccesses());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o QR da live.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const liveAccess = useMemo(() => findLivePrayerAccess(accesses), [accesses]);
  const available = liveAccess
    ? liveAccess.active && (!liveAccess.expiresAt || new Date(liveAccess.expiresAt).getTime() > Date.now())
    : false;
  const formUrl = liveAccess ? livePrayerFormUrl(liveAccess.token, 'shared_link') : '';
  const obsUrl = liveAccess ? livePrayerObsUrl(liveAccess.token) : '';
  const localLink = currentLinkIsLocal();

  async function createLive() {
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const access = await api.createGuestAccess({
        name: LIVE_PRAYER_ACCESS_NAME,
        types: [...LIVE_PRAYER_TYPES],
      });
      setAccesses((current) => [access, ...current]);
      setFeedback('QR da live criado. Baixe a imagem ou use a sobreposição no OBS.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o QR da live.');
    } finally {
      setBusy(false);
    }
  }

  async function copy(label: string, value: string) {
    setError('');
    try {
      await copyText(value);
      setFeedback(`${label} copiado.`);
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione o endereço e copie manualmente.');
    }
  }

  async function downloadObsQr() {
    if (!liveAccess || localLink) return;
    setError('');
    try {
      await downloadGuestQrPng({
        value: livePrayerFormUrl(liveAccess.token, 'qr'),
        filename: 'qr-oracao-da-live.png',
      });
      setFeedback('QR Code baixado. No OBS, use Fontes → Imagem.');
    } catch {
      setError('Não foi possível baixar o QR Code.');
    }
  }

  return (
    <section className="live-prayer-access" aria-labelledby="live-prayer-access-title">
      <div className="live-prayer-access-heading">
        <div>
          <span className="live-prayer-access-eyebrow"><AppIcon name="qr" /> Transmissão ao vivo</span>
          <h2 id="live-prayer-access-title">Oração da live</h2>
          <p>Rota aberta para quem assiste. O QR já sai pronto para colocar no OBS.</p>
        </div>
        <Link to="/acessos">Gerenciar acessos <AppIcon name="arrow" /></Link>
      </div>

      <div className="live-prayer-access-feedback" aria-live="polite">
        {feedback && <span className="success"><AppIcon name="check" />{feedback}</span>}
        {error && <span className="error" role="alert">{error}</span>}
      </div>

      <article className="live-prayer-access-card card">
        {loading ? (
          <p className="live-prayer-access-loading">Carregando...</p>
        ) : liveAccess ? (
          <div className="live-prayer-access-content">
            <GuestAccessQr
              token={liveAccess.token}
              name={liveAccess.name}
              types={LIVE_PRAYER_TYPES}
              size={176}
              compact
              contrast="print"
            />
            <div className="live-prayer-access-info">
              <div className="live-prayer-access-card-header">
                <div>
                  <h3>{liveAccess.name}</h3>
                  <p>Quem aponta a câmera envia o pedido sem login.</p>
                </div>
                <strong className={available ? 'active' : 'inactive'}>
                  {available ? 'Ativo' : 'Inativo'}
                </strong>
              </div>
              <label htmlFor="live-prayer-form-url">Link do pedido</label>
              <input
                id="live-prayer-form-url"
                value={formUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
              <label htmlFor="live-prayer-obs-url">Sobreposição para o OBS</label>
              <input
                id="live-prayer-obs-url"
                value={obsUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="live-prayer-access-actions">
                <button type="button" onClick={() => copy('Link do pedido', formUrl)}>
                  <AppIcon name="copy" />Copiar link
                </button>
                <button type="button" onClick={() => copy('Endereço do OBS', obsUrl)}>
                  <AppIcon name="copy" />Copiar OBS
                </button>
                <a href={obsUrl} target="_blank" rel="noreferrer">
                  <AppIcon name="external" />Abrir sobreposição
                </a>
                <button type="button" onClick={() => void downloadObsQr()} disabled={localLink}>
                  <AppIcon name="download" />Baixar QR para o OBS
                </button>
              </div>
              <ol className="live-prayer-obs-steps">
                <li>No OBS, em Fontes, adicione <strong>Navegador</strong>.</li>
                <li>Cole o endereço da sobreposição. Use 480 × 720 e fundo transparente.</li>
                <li>Se preferir imagem, baixe o QR e adicione como <strong>Imagem</strong>.</li>
              </ol>
            </div>
          </div>
        ) : (
          <div className="live-prayer-access-empty">
            <AppIcon name="prayer" />
            <p>Ainda não existe um QR exclusivo para os pedidos da live.</p>
            {canCreate ? (
              <button type="button" onClick={() => void createLive()} disabled={busy}>
                <AppIcon name="plus" />
                {busy ? 'Gerando...' : 'Gerar QR da live'}
              </button>
            ) : (
              <p>Peça ao responsável da igreja para gerar este QR em Acessos sem login.</p>
            )}
          </div>
        )}
      </article>
    </section>
  );
}
