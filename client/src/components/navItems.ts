import type { Permission } from '../utils/permissions';

export const NAV_SECTION_IDS = ['home', 'portaria', 'worship', 'admin'] as const;

export type NavSectionId = (typeof NAV_SECTION_IDS)[number];

export type NavBadge = 'vehicleNotices';

export type NavFeatureFlag = 'visitorFollowUpEnabled';

export type NavItem = {
  to: '/' | '/visitantes' | '/acompanhamento' | '/avisos-veiculos' | '/cultos' | '/oracao' | '/paineis' | '/relatorios' | '/acessos' | '/igreja' | '/configuracoes';
  label: string;
  short: string;
  icon: 'home' | 'users' | 'heartHand' | 'car' | 'calendar' | 'prayer' | 'panels' | 'chart' | 'link' | 'pin' | 'music';
  section: NavSectionId;
  permissions: readonly Permission[];
  requiresFeature?: NavFeatureFlag;
  badge?: NavBadge;
};

export const NAV_SECTION_LABELS: Record<Exclude<NavSectionId, 'home'>, string> = {
  portaria: 'PORTARIA',
  worship: 'CULTO E EXIBIÇÃO',
  admin: 'ADMINISTRAÇÃO',
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/',
    label: 'Início',
    short: 'Início',
    icon: 'home',
    section: 'home',
    permissions: [],
  },
  {
    to: '/visitantes',
    label: 'Visitantes',
    short: 'Visit.',
    icon: 'users',
    section: 'portaria',
    permissions: ['visitors:read', 'visitors:create'],
  },
  {
    to: '/acompanhamento',
    label: 'Acompanhamento',
    short: 'Acomp.',
    icon: 'heartHand',
    section: 'portaria',
    permissions: ['follow_up:read'],
    requiresFeature: 'visitorFollowUpEnabled',
  },
  {
    to: '/avisos-veiculos',
    label: 'Avisos de veículos',
    short: 'Avisos',
    icon: 'car',
    section: 'portaria',
    permissions: ['vehicle_notices:read'],
    badge: 'vehicleNotices',
  },
  {
    to: '/cultos',
    label: 'Cultos',
    short: 'Cultos',
    icon: 'calendar',
    section: 'worship',
    permissions: ['services:read'],
  },
  {
    to: '/oracao',
    label: 'Pedidos de oração',
    short: 'Oração',
    icon: 'prayer',
    section: 'worship',
    permissions: ['prayers:read', 'prayers:create'],
  },
  {
    to: '/paineis',
    label: 'Painéis',
    short: 'Painéis',
    icon: 'panels',
    section: 'worship',
    permissions: ['panels:open'],
  },
  {
    to: '/relatorios',
    label: 'Relatórios',
    short: 'Relat.',
    icon: 'chart',
    section: 'admin',
    permissions: ['reports:read'],
  },
  {
    to: '/acessos',
    label: 'Acessos sem login',
    short: 'Acessos',
    icon: 'link',
    section: 'admin',
    permissions: ['guest_accesses:read'],
  },
  {
    to: '/igreja',
    label: 'Igreja',
    short: 'Igreja',
    icon: 'pin',
    section: 'admin',
    permissions: ['church:read', 'team:read'],
  },
  {
    to: '/configuracoes',
    label: 'Holyrics',
    short: 'Holyrics',
    icon: 'music',
    section: 'admin',
    permissions: ['holyrics:read', 'holyrics:configure'],
  },
];

export type NavSectionGroup = {
  id: NavSectionId;
  label: string | null;
  items: NavItem[];
};

export function visibleNavSections(items: readonly NavItem[]): NavSectionGroup[] {
  return NAV_SECTION_IDS.flatMap((id) => {
    const sectionItems = items.filter((item) => item.section === id);
    if (sectionItems.length === 0) return [];
    return [
      {
        id,
        label: id === 'home' ? null : NAV_SECTION_LABELS[id],
        items: sectionItems,
      },
    ];
  });
}

export function isNavItemActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}
