export const PERMISSIONS = [
  'church:read',
  'church:update',
  'team:read',
  'team:invite',
  'team:update',
  'team:deactivate',
  'visitors:create',
  'visitors:read',
  'visitors:delete',
  'prayers:create',
  'prayers:read',
  'prayers:delete',
  'prayers:project',
  'services:create',
  'services:read',
  'services:update',
  'services:delete',
  'holyrics:read',
  'holyrics:configure',
  'holyrics:sync',
  'vehicle_notices:create',
  'vehicle_notices:read',
  'vehicle_notices:announce',
  'vehicle_notices:resolve',
  'vehicle_notices:archive',
  'guest_accesses:read',
  'guest_accesses:create',
  'guest_accesses:update',
  'guest_accesses:revoke',
  'panels:open',
  'panels:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const TEAM_ROLES = [
  'owner',
  'admin',
  'portaria',
  'intercession',
  'louvor',
  'midia',
] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];

export const INVITABLE_ROLES = [
  'admin',
  'portaria',
  'intercession',
  'louvor',
  'midia',
] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const INVITE_TTL_DAYS = [1, 3, 7, 15] as const;
export const DEFAULT_INVITE_TTL_DAYS = 7;

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  portaria: 'Portaria',
  intercession: 'Intercessão',
  louvor: 'Louvor',
  midia: 'Mídia',
};

export const TEAM_ROLE_SUMMARIES: Record<TeamRole, string> = {
  owner: 'Acesso completo à igreja e à equipe',
  admin: 'Acesso à operação da igreja',
  portaria: 'Visitantes e avisos de veículos',
  intercession: 'Pedidos de oração',
  louvor: 'Cultos, músicas e Holyrics',
  midia: 'Painéis de TV',
};

export const TEAM_ROLE_ICONS: Record<TeamRole, 'shield' | 'users' | 'prayer' | 'music' | 'panels' | 'user'> = {
  owner: 'user',
  admin: 'shield',
  portaria: 'users',
  intercession: 'prayer',
  louvor: 'music',
  midia: 'panels',
};

const ROLE_PERMISSIONS: Record<TeamRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: [
    'church:read',
    'team:read',
    'team:invite',
    'team:update',
    'team:deactivate',
    'visitors:create',
    'visitors:read',
    'visitors:delete',
    'prayers:create',
    'prayers:read',
    'prayers:delete',
    'prayers:project',
    'services:create',
    'services:read',
    'services:update',
    'services:delete',
    'vehicle_notices:create',
    'vehicle_notices:read',
    'vehicle_notices:announce',
    'vehicle_notices:resolve',
    'vehicle_notices:archive',
    'guest_accesses:read',
    'guest_accesses:create',
    'guest_accesses:update',
    'guest_accesses:revoke',
    'panels:open',
    'panels:manage',
  ],
  portaria: [
    'visitors:create',
    'visitors:read',
    'vehicle_notices:create',
    'vehicle_notices:read',
    'vehicle_notices:announce',
    'vehicle_notices:resolve',
  ],
  intercession: ['prayers:create', 'prayers:read', 'prayers:delete'],
  louvor: [
    'services:create',
    'services:read',
    'services:update',
    'services:delete',
    'holyrics:read',
    'holyrics:configure',
    'holyrics:sync',
    'panels:open',
  ],
  midia: [
    'guest_accesses:read',
    'guest_accesses:create',
    'guest_accesses:update',
    'guest_accesses:revoke',
    'panels:open',
    'panels:manage',
  ],
};

export const PERMISSION_GROUPS: Array<{ title: string; items: Array<{ key: Permission; label: string }> }> = [
  {
    title: 'Igreja e equipe',
    items: [
      { key: 'church:read', label: 'Ver dados da igreja' },
      { key: 'church:update', label: 'Alterar dados da igreja' },
      { key: 'team:read', label: 'Ver a equipe' },
      { key: 'team:invite', label: 'Convidar pessoas' },
      { key: 'team:update', label: 'Alterar funções e permissões' },
      { key: 'team:deactivate', label: 'Desativar acessos' },
    ],
  },
  {
    title: 'Visitantes',
    items: [
      { key: 'visitors:create', label: 'Registrar visitantes' },
      { key: 'visitors:read', label: 'Consultar visitantes' },
      { key: 'visitors:delete', label: 'Remover visitantes' },
    ],
  },
  {
    title: 'Oração',
    items: [
      { key: 'prayers:create', label: 'Registrar pedidos' },
      { key: 'prayers:read', label: 'Consultar pedidos de oração' },
      { key: 'prayers:delete', label: 'Remover pedidos' },
    ],
  },
  {
    title: 'Cultos e Holyrics',
    items: [
      { key: 'services:read', label: 'Consultar cultos' },
      { key: 'services:create', label: 'Criar cultos' },
      { key: 'services:update', label: 'Editar cultos e músicas' },
      { key: 'services:delete', label: 'Remover cultos' },
      { key: 'holyrics:read', label: 'Ver Holyrics' },
      { key: 'holyrics:configure', label: 'Configurar Holyrics' },
      { key: 'holyrics:sync', label: 'Enviar ao Holyrics' },
    ],
  },
  {
    title: 'Veículos',
    items: [
      { key: 'vehicle_notices:create', label: 'Criar avisos internos' },
      { key: 'vehicle_notices:read', label: 'Consultar avisos' },
      { key: 'vehicle_notices:announce', label: 'Marcar como anunciado' },
      { key: 'vehicle_notices:resolve', label: 'Resolver aviso' },
    ],
  },
  {
    title: 'Painéis e acessos',
    items: [
      { key: 'panels:open', label: 'Abrir painéis de TV' },
      { key: 'panels:manage', label: 'Gerenciar acessos das TVs' },
      { key: 'guest_accesses:read', label: 'Ver acessos públicos' },
      { key: 'guest_accesses:create', label: 'Criar acessos públicos' },
      { key: 'guest_accesses:update', label: 'Alterar acessos públicos' },
      { key: 'guest_accesses:revoke', label: 'Desativar acessos públicos' },
    ],
  },
];

export function permissionsForRole(role: TeamRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(
  granted: readonly string[] | undefined,
  permission: Permission
): boolean {
  return Boolean(granted?.includes(permission));
}

export function hasAnyPermission(
  granted: readonly string[] | undefined,
  permissions: readonly Permission[]
): boolean {
  return permissions.some((permission) => hasPermission(granted, permission));
}

export function navItemVisible(path: string, role?: TeamRole, permissions?: readonly string[]): boolean {
  if (role === 'owner') return true;
  const needed: Record<string, Permission[]> = {
    '/': [],
    '/visitantes': ['visitors:read', 'visitors:create'],
    '/oracao': ['prayers:read', 'prayers:create'],
    '/acessos': ['guest_accesses:read'],
    '/cultos': ['services:read'],
    '/avisos-veiculos': ['vehicle_notices:read'],
    '/paineis': ['panels:open'],
    '/igreja': ['church:read', 'team:read'],
    '/configuracoes': ['holyrics:read', 'holyrics:configure'],
  };
  const list = needed[path];
  if (!list) return true;
  if (list.length === 0) return true;
  return hasAnyPermission(permissions, list);
}
