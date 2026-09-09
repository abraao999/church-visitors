export const NAV_ITEMS = [
  { to: '/', label: 'Início', short: 'Início', icon: 'home' },
  { to: '/visitantes', label: 'Visitantes', short: 'Visit.', icon: 'users' },
  { to: '/acompanhamento', label: 'Acompanhamento', short: 'Acomp.', icon: 'heartHand' },
  { to: '/oracao', label: 'Oração', short: 'Oração', icon: 'prayer' },
  { to: '/acessos', label: 'Acessos', short: 'Acessos', icon: 'link' },
  { to: '/cultos', label: 'Cultos', short: 'Cultos', icon: 'calendar' },
  { to: '/avisos-veiculos', label: 'Avisos de veículos', short: 'Avisos', icon: 'car' },
  { to: '/paineis', label: 'Painéis', short: 'Painéis', icon: 'panels' },
  { to: '/igreja', label: 'Igreja', short: 'Igreja', icon: 'pin' },
  { to: '/configuracoes', label: 'Holyric', short: 'Holyric', icon: 'music' },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];

export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.to !== '/acessos');

const DRAWER_PRIMARY = [
  '/',
  '/visitantes',
  '/acompanhamento',
  '/oracao',
  '/cultos',
  '/avisos-veiculos',
  '/paineis',
  '/acessos',
] as const;

const DRAWER_ADMIN = ['/igreja', '/configuracoes'] as const;

const DRAWER_LABELS: Partial<Record<NavItem['to'], string>> = {
  '/oracao': 'Pedidos de oração',
  '/acessos': 'Acessos sem login',
};

export function drawerLabel(item: NavItem): string {
  return DRAWER_LABELS[item.to] ?? item.label;
}

function pickDrawerItems(visible: readonly NavItem[], order: readonly string[]): NavItem[] {
  return order
    .map((to) => visible.find((item) => item.to === to))
    .filter((item): item is NavItem => Boolean(item));
}

export function drawerSections(visible: readonly NavItem[]) {
  return {
    primary: pickDrawerItems(visible, DRAWER_PRIMARY),
    admin: pickDrawerItems(visible, DRAWER_ADMIN),
  };
}
