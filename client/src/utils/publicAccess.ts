import type { GuestAccessType } from '../types';

export const PUBLIC_ACCESS_OPTIONS: Array<{
  type: GuestAccessType;
  path: 'visitantes' | 'oracao' | 'veiculos';
  title: string;
  description: string;
  icon: 'users' | 'prayer' | 'car';
  tone: 'visitors' | 'prayer' | 'vehicle';
}> = [
  {
    type: 'visitors:create',
    path: 'visitantes',
    title: 'Registrar visitantes',
    description: 'Cadastre quem chegou ao culto.',
    icon: 'users',
    tone: 'visitors',
  },
  {
    type: 'prayers:create',
    path: 'oracao',
    title: 'Enviar pedido de oração',
    description: 'Compartilhe seu pedido com a igreja.',
    icon: 'prayer',
    tone: 'prayer',
  },
  {
    type: 'vehicle_notices:create',
    path: 'veiculos',
    title: 'Avisar sobre um veículo',
    description: 'Informe a placa e o que precisa ser feito.',
    icon: 'car',
    tone: 'vehicle',
  },
];

export const OPTION_LABELS: Record<GuestAccessType, string> = {
  'visitors:create': 'Cadastro de visitantes',
  'prayers:create': 'Pedidos de oração',
  'vehicle_notices:create': 'Avisos de veículos',
  'panels:read': 'Painéis para TV (somente leitura)',
};

export type PanelPath = 'louvores' | 'visitantes' | 'oracao' | 'veiculos';

export const PANEL_OPTIONS: Array<{
  path: PanelPath;
  title: string;
  description: string;
  icon: 'music' | 'users' | 'prayer' | 'car';
  tone: 'visitors' | 'prayer' | 'vehicle';
}> = [
  {
    path: 'visitantes',
    title: 'Visitantes de hoje',
    description: 'Quem chegou ao culto.',
    icon: 'users',
    tone: 'visitors',
  },
  {
    path: 'oracao',
    title: 'Pedidos de oração',
    description: 'Somente os pedidos autorizados.',
    icon: 'prayer',
    tone: 'prayer',
  },
  {
    path: 'louvores',
    title: 'Louvores',
    description: 'Hinos do culto de hoje.',
    icon: 'music',
    tone: 'prayer',
  },
  {
    path: 'veiculos',
    title: 'Avisos de veículos',
    description: 'Placas que precisam de atenção.',
    icon: 'car',
    tone: 'vehicle',
  },
];

export function publicFormPath(token: string, type: GuestAccessType): string {
  const option = PUBLIC_ACCESS_OPTIONS.find((item) => item.type === type);
  return option ? `/acesso/${token}/${option.path}` : `/acesso/${token}`;
}

export function publicMenuPath(token: string): string {
  return `/acesso/${token}`;
}

export function panelPath(token: string, path: PanelPath): string {
  return `/painel/${token}/${path}`;
}

export function panelMenuPath(token: string): string {
  return `/painel/${token}`;
}

/** Um acesso é de painel ou de formulário, nunca os dois no mesmo link. */
export function isPanelAccessType(type: GuestAccessType): boolean {
  return type === 'panels:read';
}

export function accessEntryPath(token: string, types: GuestAccessType[]): string {
  return types.some(isPanelAccessType) ? panelMenuPath(token) : publicMenuPath(token);
}

export function typeFromPublicPath(pathname: string): GuestAccessType | 'menu' | null {
  if (/\/visitantes\/?$/.test(pathname)) return 'visitors:create';
  if (/\/oracao\/?$/.test(pathname)) return 'prayers:create';
  if (/\/veiculos\/?$/.test(pathname)) return 'vehicle_notices:create';
  if (/\/acesso\/[^/]+\/?$/.test(pathname)) return 'menu';
  return null;
}

export function resolvePublicTypes(types: GuestAccessType[] | undefined, type: GuestAccessType): GuestAccessType[] {
  if (Array.isArray(types) && types.length > 0) return types;
  return type ? [type] : [];
}
