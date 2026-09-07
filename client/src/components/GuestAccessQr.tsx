import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useTheme } from '../theme/ThemeContext';
import type { GuestAccessType } from '../types';
import { accessEntryPath } from '../utils/publicAccess';
import { resolvePublicOrigin } from '../utils/publicOrigin';
import { AppIcon } from './AppIcon';
import './GuestAccessQr.css';

interface Props {
  token: string;
  name: string;
  types?: GuestAccessType[];
  size?: number;
  compact?: boolean;
}

function currentPublicOrigin() {
  return resolvePublicOrigin(
    window.location.origin,
    import.meta.env.VITE_PUBLIC_ORIGIN
  );
}

export function guestAccessUrl(token: string, types: GuestAccessType[] = []): string {
  return `${currentPublicOrigin().origin}${accessEntryPath(token, types)}`;
}

function safeFilename(name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `qr-${normalized || 'acesso'}.png`;
}

export function GuestAccessQr({ token, name, types = [], size = 240, compact = false }: Props) {
  const { isDark } = useTheme();
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState(false);
  const link = useMemo(
    () => guestAccessUrl(token, types),
    // types muda de identidade a cada render do pai; a chave real é o conteúdo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, types.join(',')]
  );
  const localOrigin = currentPublicOrigin().local;

  useEffect(() => {
    let cancelled = false;
    setDataUrl('');
    setError(false);

    QRCode.toDataURL(link, {
      width: size,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: isDark
        ? { dark: '#f3f4f6', light: '#1e2430' }
        : { dark: '#172033', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isDark, size, link]);

  function download() {
    if (!dataUrl || localOrigin) return;
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = safeFilename(name);
    anchor.click();
  }

  return (
    <div className={`guest-qr${compact ? ' guest-qr-compact' : ''}`}>
      {dataUrl ? (
        <img src={dataUrl} alt={`QR Code do acesso ${name}`} width={size} height={size} />
      ) : (
        <div className="guest-qr-placeholder" style={{ width: size, height: size }}>
          {error ? 'QR Code indisponível' : 'Gerando QR Code...'}
        </div>
      )}
      {localOrigin && (
        <p className="guest-qr-local-warning" role="status">
          <AppIcon name="info" />
          Este link só funciona neste computador. Não imprima nem compartilhe o QR Code
          até abrir o sistema no endereço público da igreja.
        </p>
      )}
      {!compact && (
        <button
          type="button"
          className="guest-action-button"
          onClick={download}
          disabled={!dataUrl || localOrigin}
        >
          <AppIcon name="download" />
          Baixar QR Code
        </button>
      )}
    </div>
  );
}
