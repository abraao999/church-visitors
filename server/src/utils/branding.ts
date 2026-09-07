export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const LOGO_FIELD = 'logo';

export const ON_PRIMARY_LIGHT = '#FFFFFF';
export const ON_PRIMARY_DARK = '#1C1917';

export const PUBLIC_BRANDING_KEYS = ['name', 'logoUrl', 'primaryColor', 'accentColor'] as const;

export type PublicChurchBranding = {
  name: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
};

export type ChurchBrandingRecord = {
  logoUrl?: string;
  logoStorageKey?: string;
  primaryColor?: string;
  accentColor?: string;
  updatedAt?: Date;
};

export function parseHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim();
  return HEX_COLOR.test(hex) ? hex.toUpperCase() : null;
}

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const [lighter, darker] = first > second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
}

export function readableOnColor(background: string): string | null {
  const light = contrastRatio(background, ON_PRIMARY_LIGHT);
  const dark = contrastRatio(background, ON_PRIMARY_DARK);
  const best = light >= dark ? { color: ON_PRIMARY_LIGHT, ratio: light } : { color: ON_PRIMARY_DARK, ratio: dark };
  return best.ratio >= 4.5 ? best.color : null;
}

export function validateBrandColor(value: unknown): { hex: string } | { error: string } {
  const hex = parseHexColor(value);
  if (!hex) {
    return { error: 'Use uma cor no formato hexadecimal #RRGGBB.' };
  }
  if (!readableOnColor(hex)) {
    return { error: 'Essa cor não tem contraste suficiente para texto em botões.' };
  }
  return { hex };
}

export function publicChurchBranding(church: {
  name: string;
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    accentColor?: string;
  } | null;
}): PublicChurchBranding {
  const branding = church.branding || {};
  const result: PublicChurchBranding = { name: church.name };
  if (branding.logoUrl) result.logoUrl = branding.logoUrl;
  if (branding.primaryColor) result.primaryColor = branding.primaryColor;
  if (branding.accentColor) result.accentColor = branding.accentColor;
  return result;
}

export function publicAccessMetadata(access: {
  churchName: string;
  accessName: string;
  scope: string;
  scopes: string[];
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
}) {
  return {
    valid: true as const,
    churchName: access.churchName,
    accessName: access.accessName,
    type: access.scope,
    types: access.scopes,
    ...(access.logoUrl ? { logoUrl: access.logoUrl } : {}),
    ...(access.primaryColor ? { primaryColor: access.primaryColor } : {}),
    ...(access.accentColor ? { accentColor: access.accentColor } : {}),
  };
}

export function publicBrandingFields(branding: PublicChurchBranding): PublicChurchBranding {
  const result: PublicChurchBranding = { name: branding.name };
  if (branding.logoUrl) result.logoUrl = branding.logoUrl;
  if (branding.primaryColor) result.primaryColor = branding.primaryColor;
  if (branding.accentColor) result.accentColor = branding.accentColor;
  return result;
}

export function rejectsClientChurchId(body: unknown): boolean {
  return Boolean(body && typeof body === 'object' && 'churchId' in body);
}

function looksLikeSvg(buffer: Buffer): boolean {
  const start = buffer.subarray(0, 256).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  return start.startsWith('<') || start.startsWith('<?xml');
}

export type LogoImageType = 'image/png' | 'image/jpeg' | 'image/webp';

export function detectLogoImageType(buffer: Buffer): LogoImageType | null {
  if (buffer.length < 12 || looksLikeSvg(buffer)) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export function logoExtension(type: LogoImageType): string {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  return 'png';
}

export const CHURCH_BRANDING_SELECT =
  'name active branding.logoUrl branding.primaryColor branding.accentColor branding.logoStorageKey branding.updatedAt';
