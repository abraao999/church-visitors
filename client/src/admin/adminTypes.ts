export type PlatformAdminRole = 'platform_owner' | 'support' | 'viewer';
export type ChurchSituation = 'ativa' | 'pendente' | 'suspensa';

export interface PlatformAdmin {
  id: string;
  name: string;
  email: string;
  role: PlatformAdminRole;
}

export interface PlatformOverview {
  churchesTotal: number;
  churchesActive: number;
  churchesSuspended: number;
  churchesPending: number;
  usersActive: number;
  churchesThisMonth: number;
  usersSeenToday: number;
  pendingItems: Array<{
    key: string;
    title: string;
    detail: string;
    actionLabel: string;
    href: string;
  }>;
  usage: Array<{
    key: string;
    label: string;
    churches: number;
    percent: number;
  }>;
}

export interface PlatformChurchRow {
  id: string;
  name: string;
  city: string;
  situation: ChurchSituation;
  ownerName: string;
  ownerEmail: string;
  memberCount: number;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface PlatformChurchList {
  items: PlatformChurchRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PlatformChurchDetail {
  id: string;
  name: string;
  city: string;
  situation: ChurchSituation;
  createdAt: string;
  lastSeenAt: string | null;
  owner: {
    name: string;
    email: string;
    emailVerified: boolean;
    active: boolean;
  } | null;
  memberCount: number;
  visitorCount: number;
  serviceCount: number;
  publicAccessCount: number;
  deviceCount: number;
  resources: Array<{ key: string; label: string; enabled: boolean }>;
}

export const PLATFORM_ROLE_LABELS: Record<PlatformAdminRole, string> = {
  platform_owner: 'Administrador principal',
  support: 'Suporte',
  viewer: 'Somente leitura',
};

export const SITUATION_LABELS: Record<ChurchSituation, string> = {
  ativa: 'Ativa',
  pendente: 'Pendente',
  suspensa: 'Suspensa',
};
