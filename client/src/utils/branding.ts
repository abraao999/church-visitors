export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp';
export const LOGO_HINT = 'PNG, JPEG ou WebP, até 2 MB. Arquivos SVG não são aceitos.';

export const DEFAULT_PRIMARY_LIGHT = '#2563EB';
export const DEFAULT_ACCENT_LIGHT = '#B45309';
export const DEFAULT_PRIMARY_DARK = '#3B82F6';
export const DEFAULT_ACCENT_DARK = '#F59E0B';
export const ON_PRIMARY_LIGHT = '#FFFFFF';
export const ON_PRIMARY_DARK = '#1C1917';

export const BRAND_CSS_VARS = [
  '--primary',
  '--primary-hover',
  '--primary-soft',
  '--accent',
  '--accent-soft',
  '--on-primary',
  '--focus-ring',
] as const;

export type ThemeMode = 'light' | 'dark';

export interface ChurchBrandingDraft {
  name: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
}

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
  if (!hex) return { error: 'Use uma cor no formato hexadecimal #RRGGBB.' };
  if (!readableOnColor(hex)) {
    return { error: 'Essa cor não tem contraste suficiente para texto em botões.' };
  }
  return { hex };
}

function mixHex(a: string, b: string, amount: number): string {
  const mix = (from: number, to: number) => Math.round(from + (to - from) * amount);
  const channelAt = (hex: string, start: number) => Number.parseInt(hex.slice(start, start + 2), 16);
  const r = mix(channelAt(a, 1), channelAt(b, 1));
  const g = mix(channelAt(a, 3), channelAt(b, 3));
  const bl = mix(channelAt(a, 5), channelAt(b, 5));
  return `#${[r, g, bl].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function hasCustomBrandColors(branding?: ChurchBrandingDraft | null): boolean {
  return Boolean(branding?.primaryColor || branding?.accentColor);
}

export function shouldApplyChurchBranding(pathname: string): boolean {
  return pathname !== '/login' && !pathname.startsWith('/convite') && !pathname.startsWith('/admin');
}

export function brandingFromUser(user?: {
  churchName?: string;
  branding?: ChurchBrandingDraft | null;
} | null): ChurchBrandingDraft | null {
  if (!user?.churchName) return null;
  return {
    name: user.churchName,
    logoUrl: user.branding?.logoUrl,
    primaryColor: user.branding?.primaryColor,
    accentColor: user.branding?.accentColor,
  };
}

export function deriveBrandCssVars(
  branding: ChurchBrandingDraft | null | undefined,
  theme: ThemeMode
): Record<(typeof BRAND_CSS_VARS)[number], string> | null {
  if (!hasCustomBrandColors(branding)) return null;
  const primary =
    parseHexColor(branding?.primaryColor) ||
    (theme === 'dark' ? DEFAULT_PRIMARY_DARK : DEFAULT_PRIMARY_LIGHT);
  const accent =
    parseHexColor(branding?.accentColor) ||
    (theme === 'dark' ? DEFAULT_ACCENT_DARK : DEFAULT_ACCENT_LIGHT);
  const onPrimary = readableOnColor(primary) || ON_PRIMARY_LIGHT;
  const surface = theme === 'dark' ? '#12151C' : '#FFFFFF';
  return {
    '--primary': primary,
    '--primary-hover': mixHex(primary, theme === 'dark' ? '#FFFFFF' : '#000000', 0.16),
    '--primary-soft': mixHex(primary, surface, theme === 'dark' ? 0.78 : 0.88),
    '--accent': accent,
    '--accent-soft': mixHex(accent, surface, theme === 'dark' ? 0.78 : 0.88),
    '--on-primary': onPrimary,
    '--focus-ring': mixHex(primary, '#FFFFFF', theme === 'dark' ? 0.28 : 0.55),
  };
}

export function applyBrandCssVars(vars: Record<string, string> | null): void {
  const root = document.documentElement;
  for (const name of BRAND_CSS_VARS) {
    if (vars?.[name]) root.style.setProperty(name, vars[name]);
    else root.style.removeProperty(name);
  }
  if (vars) root.setAttribute('data-branding', 'custom');
  else root.removeAttribute('data-branding');
}

export function isAllowedLogoFile(file: File): { ok: true } | { error: string } {
  const name = file.name.toLowerCase();
  if (file.type === 'image/svg+xml' || name.endsWith('.svg')) {
    return { error: 'Não aceitamos arquivos SVG.' };
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) && !/\.(png|jpe?g|webp)$/.test(name)) {
    return { error: 'Envie um PNG, JPEG ou WebP de até 2 MB.' };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { error: 'O logotipo deve ter no máximo 2 MB.' };
  }
  return { ok: true };
}

export function publicBrandingKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) =>
    ['name', 'logoUrl', 'primaryColor', 'accentColor'].includes(key)
  );
}
