import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useTheme } from '../theme/ThemeContext';
import type { GuestAccessType } from '../types';
import { accessEntryPath, livePrayerFormPath, livePrayerObsPath } from '../utils/publicAccess';
import { resolvePublicOrigin } from '../utils/publicOrigin';
import { AppIcon } from './AppIcon';
import './GuestAccessQr.css';

interface Props {
  token: string;
  name: string;
  types?: GuestAccessType[];
  size?: number;
  compact?: boolean;
  contrast?: 'theme' | 'print';
  downloadLabel?: string;
}

const PRINT_QR_COLORS = { dark: '#111111', light: '#ffffff' } as const;

function currentPublicOrigin() {
  return resolvePublicOrigin(
    window.location.origin,
    import.meta.env.VITE_PUBLIC_ORIGIN
  );
}

function withChannel(path: string, channel?: 'qr' | 'shared_link'): string {
  if (channel === 'qr') return `${path}${path.includes('?') ? '&' : '?'}origem=qr`;
  if (channel === 'shared_link') return `${path}${path.includes('?') ? '&' : '?'}origem=link`;
  return path;
}

export function guestAccessUrl(
  token: string,
  types: GuestAccessType[] = [],
  channel?: 'qr' | 'shared_link'
): string {
  return withChannel(`${currentPublicOrigin().origin}${accessEntryPath(token, types)}`, channel);
}

export function livePrayerFormUrl(token: string, channel?: 'qr' | 'shared_link'): string {
  return withChannel(`${currentPublicOrigin().origin}${livePrayerFormPath(token)}`, channel);
}

export function livePrayerObsUrl(token: string): string {
  return `${currentPublicOrigin().origin}${livePrayerObsPath(token)}`;
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

export async function downloadGuestQrPng(options: {
  value: string;
  filename: string;
  size?: number;
}): Promise<void> {
  const url = await QRCode.toDataURL(options.value, {
    width: options.size ?? 720,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: PRINT_QR_COLORS,
  });
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = options.filename.endsWith('.png') ? options.filename : `${options.filename}.png`;
  anchor.click();
}

export function GuestAccessQr({
  token,
  name,
  types = [],
  size = 240,
  compact = false,
  contrast = 'theme',
  downloadLabel = 'Baixar QR Code',
}: Props) {
  const { isDark } = useTheme();
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState(false);
  const print = contrast === 'print';
  const link = useMemo(
    () => guestAccessUrl(token, types, 'qr'),
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
      errorCorrectionLevel: print ? 'H' : 'M',
      color: print
        ? PRINT_QR_COLORS
        : isDark
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
  }, [isDark, print, size, link]);

  async function download() {
    if (localOrigin) return;
    try {
      if (print) {
        await downloadGuestQrPng({ value: link, filename: safeFilename(name) });
        return;
      }
      if (!dataUrl) return;
      const anchor = document.createElement('a');
      anchor.href = dataUrl;
      anchor.download = safeFilename(name);
      anchor.click();
    } catch {
      setError(true);
    }
  }

  return (
    <div className={`guest-qr${compact ? ' guest-qr-compact' : ''}${print ? ' guest-qr-print' : ''}`}>
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
          onClick={() => void download()}
          disabled={(!dataUrl && !print) || localOrigin}
        >
          <AppIcon name="download" />
          {downloadLabel}
        </button>
      )}
    </div>
  );
}
