import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { BrandMark } from '../components/BrandMark';
import { livePrayerFormUrl } from '../components/GuestAccessQr';
import { useBranding } from '../theme/BrandingContext';
import type { PublicAccessMetadata } from '../types';
import { resolvePublicTypes } from '../utils/publicAccess';
import './LivePrayerObsPage.css';

const QR_COLORS = { dark: '#111111', light: '#ffffff' } as const;

export function LivePrayerObsPage() {
  const { token = '' } = useParams();
  const [searchParams] = useSearchParams();
  const darkBackdrop = searchParams.get('fundo') === 'escuro';
  const { setPublicBranding } = useBranding();
  const [metadata, setMetadata] = useState<PublicAccessMetadata | null>(null);
  const [error, setError] = useState('');
  const [qrUrl, setQrUrl] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setMetadata(await api.getPublicAccess(token));
    } catch (err) {
      setMetadata(null);
      setError(err instanceof Error ? err.message : 'Não foi possível validar este acesso.');
    }
  }, [token]);

  useEffect(() => {
    document.documentElement.classList.add('obs-overlay');
    document.body.classList.add('obs-overlay');
    return () => {
      document.documentElement.classList.remove('obs-overlay');
      document.body.classList.remove('obs-overlay');
    };
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!metadata) {
      setPublicBranding(null);
      return;
    }
    setPublicBranding({
      name: metadata.churchName,
      logoUrl: metadata.logoUrl,
      primaryColor: metadata.primaryColor,
      accentColor: metadata.accentColor,
    });
    return () => setPublicBranding(null);
  }, [metadata, setPublicBranding]);

  useEffect(() => {
    if (!token || !metadata) {
      setQrUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(livePrayerFormUrl(token, 'qr'), {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: QR_COLORS,
    })
      .then((url) => {
        if (!cancelled) setQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [token, metadata]);

  const types = metadata ? resolvePublicTypes(metadata.types, metadata.type) : [];
  const canReceivePrayer = types.includes('prayers:create');

  return (
    <main className={`obs-prayer-page${darkBackdrop ? ' obs-prayer-dark' : ''}`}>
      {!metadata ? (
        <section className="obs-prayer-card obs-prayer-status" role="alert">
          <p>{error || 'Carregando QR Code da live...'}</p>
        </section>
      ) : !canReceivePrayer ? (
        <section className="obs-prayer-card obs-prayer-status" role="alert">
          <p>Este acesso não recebe pedidos de oração.</p>
        </section>
      ) : (
        <section className="obs-prayer-card">
          <header className="obs-prayer-brand">
            <BrandMark
              name={metadata.churchName}
              logoUrl={metadata.logoUrl}
              fallbackClassName="obs-prayer-cross"
            />
            <div>
              <strong>{metadata.churchName}</strong>
              <span>Pedido de oração</span>
            </div>
          </header>
          {qrUrl ? (
            <img
              className="obs-prayer-qr"
              src={qrUrl}
              alt="QR Code para enviar pedido de oração"
              width={320}
              height={320}
            />
          ) : (
            <div className="obs-prayer-qr-placeholder">Gerando QR Code...</div>
          )}
          <p className="obs-prayer-hint">Aponte a câmera e envie seu pedido</p>
        </section>
      )}
    </main>
  );
}
