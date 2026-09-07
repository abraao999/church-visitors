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

const PERMISSION_SET = new Set<string>(PERMISSIONS);

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && PERMISSION_SET.has(value);
}

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === 'string' && (TEAM_ROLES as readonly string[]).includes(value);
}

export function isInvitableRole(value: unknown): value is InvitableRole {
  return typeof value === 'string' && (INVITABLE_ROLES as readonly string[]).includes(value);
}

export function permissionsForRole(role: TeamRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function sanitizePermissions(values: unknown): Permission[] {
  if (!Array.isArray(values)) return [];
  const unique: Permission[] = [];
  for (const value of values) {
    if (isPermission(value) && !unique.includes(value)) unique.push(value);
  }
  return unique;
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

export function resolvePermissions(input: {
  role?: unknown;
  permissions?: unknown;
  permissionsCustomized?: unknown;
}): Permission[] {
  const role = isTeamRole(input.role) ? input.role : 'portaria';
  if (role === 'owner') return permissionsForRole('owner');
  if (input.permissionsCustomized === true) {
    return sanitizePermissions(input.permissions);
  }
  return permissionsForRole(role);
}

export function samePermissionSet(a: readonly Permission[], b: readonly Permission[]): boolean {
  if (a.length !== b.length) return false;
  const other = new Set(b);
  return a.every((item) => other.has(item));
}

export function clampPermissionsToGrant(
  requested: readonly Permission[],
  granter: readonly Permission[]
): Permission[] {
  const allowed = new Set(granter);
  return requested.filter((permission) => allowed.has(permission));
}

export function canGrantPermissions(
  granter: readonly Permission[],
  requested: readonly Permission[]
): boolean {
  return requested.every((permission) => granter.includes(permission));
}

export function permissionSummaries(permissions: readonly Permission[]): string[] {
  const labels: Array<[Permission[], string]> = [
    [['visitors:read', 'visitors:create'], 'Visitantes'],
    [['prayers:read', 'prayers:create'], 'Pedidos de oração'],
    [['vehicle_notices:read', 'vehicle_notices:create'], 'Avisos de veículos'],
    [['services:read', 'services:create'], 'Cultos'],
    [['holyrics:read', 'holyrics:sync', 'holyrics:configure'], 'Holyrics'],
    [['panels:open', 'panels:manage'], 'Painéis de TV'],
    [['guest_accesses:read', 'guest_accesses:create'], 'Acessos públicos'],
    [['team:read', 'team:invite'], 'Equipe'],
    [['church:update'], 'Dados da igreja'],
  ];
  return labels
    .filter(([needed]) => needed.some((permission) => permissions.includes(permission)))
    .map(([, label]) => label);
}
