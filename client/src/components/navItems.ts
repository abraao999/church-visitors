export const NAV_ITEMS = [
  { to: '/', label: 'Início', short: 'Início', icon: 'home' },
  { to: '/visitantes', label: 'Visitantes', short: 'Visit.', icon: 'users' },
  { to: '/oracao', label: 'Oração', short: 'Oração', icon: 'prayer' },
  { to: '/acessos', label: 'Acessos', short: 'Acessos', icon: 'link' },
  { to: '/cultos', label: 'Cultos', short: 'Cultos', icon: 'calendar' },
  { to: '/avisos-veiculos', label: 'Avisos de veículos', short: 'Avisos', icon: 'car' },
  { to: '/paineis', label: 'Painéis', short: 'Painéis', icon: 'panels' },
  { to: '/igreja', label: 'Igreja', short: 'Igreja', icon: 'pin' },
  { to: '/configuracoes', label: 'Holyric', short: 'Holyric', icon: 'music' },
] as const;

export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.to !== '/acessos');
