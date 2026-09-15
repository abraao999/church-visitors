export type PlatformAdminRole = 'platform_owner' | 'support' | 'viewer';
export type ChurchSituation = 'ativa' | 'pendente' | 'suspensa';

export interface PlatformAdmin {
  id: string;
  name: string;
  email: string;
  role: PlatformAdminRole;
}

export interface PlatformAdminRow extends PlatformAdmin {
  active: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface PlatformAdminList {
  items: PlatformAdminRow[];
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

export type PlatformAuditOperation =
  | 'login_succeeded'
  | 'login_blocked'
  | 'logout'
  | 'church_assisted_created'
  | 'church_suspended'
  | 'church_reactivated'
  | 'verification_resent'
  | 'password_reset_requested'
  | 'admin_changed'
  | 'platform_settings_updated'
  | 'platform_test_email_sent'
  | 'church_approved';

export interface PlatformActivityList {
  items: Array<{
    id: string;
    adminName: string;
    adminRole: PlatformAdminRole | null;
    operation: PlatformAuditOperation;
    churchName: string | null;
    churchId: string | null;
    reason: string | null;
    createdAt: string;
  }>;
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
  pendente: 'Aguardando aprovação',
  suspensa: 'Suspensa',
};

export type HealthOverall = 'healthy' | 'warning' | 'critical' | 'unknown';
export type HealthServiceStatus = 'healthy' | 'warning' | 'critical' | 'not_configured' | 'unknown';

export interface PlatformHealth {
  checkedAt: string;
  overall: HealthOverall;
  services: Array<{
    key: 'api' | 'database' | 'email' | 'storage';
    label: string;
    status: HealthServiceStatus;
    message: string;
    latencyMs?: number;
  }>;
  jobs: Array<{
    key: 'retention';
    label: string;
    scheduleLabel: string;
    lastStartedAt?: string;
    lastCompletedAt?: string;
    nextRunAt?: string;
    durationMs?: number;
    status: 'completed' | 'failed' | 'running' | 'never_run';
    summary?: {
      policiesFound: number;
      churchesProcessed: number;
      churchesSkipped: number;
      failures: number;
    };
  }>;
  incidents: Array<{
    id: string;
    source: string;
    severity: 'warning' | 'critical';
    title: string;
    message: string;
    createdAt: string;
  }>;
  deployment: {
    environment?: string;
    version?: string;
    commit?: string;
  };
}

export const HEALTH_OVERALL_LABELS: Record<HealthOverall, string> = {
  healthy: 'Funcionando normalmente',
  warning: 'Disponível com atenção',
  critical: 'Indisponibilidade detectada',
  unknown: 'Não foi possível verificar',
};

export type PlatformApprovalMode = 'automatic' | 'manual';
export type PlatformResendStatus = 'verified' | 'not_configured';
export type PlatformNoticeTone = 'info' | 'warning';

export interface PlatformRetentionDefaults {
  enabled: boolean;
  visitorsMonths: number;
  prayersDays: number;
  vehicleNoticesDays: number;
  guestAccessesDays: number;
  teamInvitationsDays: number;
  portariaDevicesDays: number;
}

export interface PlatformMaintenanceWindow {
  id: string;
  startsAt: string;
  endsAt: string;
  message: string;
}

export interface PlatformSettings {
  registrations: {
    enabled: boolean;
    requireEmailConfirmation: true;
    approvalMode: PlatformApprovalMode;
    closedMessage: string;
  };
  email: {
    senderName: string;
    senderAddress: string;
    replyTo: string;
    resendStatus: PlatformResendStatus;
    appOrigin: string;
    ttl: {
      verificationMinutes: number;
      resetMinutes: number;
      resendSeconds: number;
    };
  };
  newChurchDefaults: {
    timezone: string;
    visitorFollowUpEnabled: boolean;
    modules: {
      visitorFollowUpEnabled: boolean;
    };
    retention: PlatformRetentionDefaults;
  };
  maintenance: {
    enabled: boolean;
    message: string;
    windows: PlatformMaintenanceWindow[];
  };
  limits: {
    maxChurches: number | null;
    maxPendingApprovals: number | null;
  };
  legal: {
    termsUrl: string;
    privacyUrl: string;
  };
  notice: {
    enabled: boolean;
    message: string;
    tone: PlatformNoticeTone;
  };
  updatedAt: string;
}

export interface PlatformSettingsUpdate {
  updatedAt: string;
  registrations: {
    enabled: boolean;
    requireEmailConfirmation: true;
    approvalMode: PlatformApprovalMode;
    closedMessage: string;
  };
  email: {
    senderName: string;
    senderAddress: string;
    replyTo: string;
    ttl: {
      verificationMinutes: number;
      resetMinutes: number;
      resendSeconds: number;
    };
  };
  newChurchDefaults: PlatformSettings['newChurchDefaults'];
  maintenance: {
    enabled: boolean;
    message: string;
    windows: Array<{
      id?: string;
      startsAt: string;
      endsAt: string;
      message: string;
    }>;
  };
  limits: PlatformSettings['limits'];
  legal: PlatformSettings['legal'];
  notice: PlatformSettings['notice'];
}

export interface PlatformPublicStatus {
  registrationsEnabled: boolean;
  closedMessage?: string;
  maintenance: {
    enabled: boolean;
    message: string;
  };
  legal?: {
    termsUrl?: string;
    privacyUrl?: string;
  };
  notice?: {
    enabled: true;
    message: string;
    tone: PlatformNoticeTone;
  };
}

export const PLATFORM_TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'Brasília (America/Sao_Paulo)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (America/Fortaleza)' },
  { value: 'America/Recife', label: 'Recife (America/Recife)' },
  { value: 'America/Bahia', label: 'Bahia (America/Bahia)' },
  { value: 'America/Belem', label: 'Belém (America/Belem)' },
  { value: 'America/Manaus', label: 'Manaus (America/Manaus)' },
  { value: 'America/Cuiaba', label: 'Cuiabá (America/Cuiaba)' },
  { value: 'America/Campo_Grande', label: 'Campo Grande (America/Campo_Grande)' },
  { value: 'America/Porto_Velho', label: 'Porto Velho (America/Porto_Velho)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (America/Rio_Branco)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (America/Noronha)' },
] as const;

export const HEALTH_STATUS_LABELS: Record<HealthServiceStatus, string> = {
  healthy: 'Operacional',
  warning: 'Atenção',
  critical: 'Indisponível',
  not_configured: 'Não configurado',
  unknown: 'Desconhecido',
};
