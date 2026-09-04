import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useTheme } from '../theme/ThemeContext';
import { AppIcon } from './AppIcon';

interface Props {
  token: string;
  name: string;
  size?: number;
  compact?: boolean;
}

export function guestAccessUrl(token: string): string {
  return `${window.location.origin}/acesso/${token}`;
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

export function GuestAccessQr({ token, name, size = 240, compact = false }: Props) {
  const { isDark } = useTheme();
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl('');
    setError(false);

    QRCode.toDataURL(guestAccessUrl(token), {
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
  }, [isDark, size, token]);

  function download() {
    if (!dataUrl) return;
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
      {!compact && (
        <button type="button" className="guest-action-button" onClick={download} disabled={!dataUrl}>
          <AppIcon name="download" />
          Baixar QR Code
        </button>
      )}
    </div>
  );
}
