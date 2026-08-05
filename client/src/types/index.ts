export const RELATIONSHIPS = [
  { value: 'pai', label: 'Pai' },
  { value: 'mae', label: 'Mãe' },
  { value: 'filho', label: 'Filho' },
  { value: 'filha', label: 'Filha' },
  { value: 'avo', label: 'Avô' },
  { value: 'ava', label: 'Avó' },
  { value: 'neto', label: 'Neto' },
  { value: 'neta', label: 'Neta' },
  { value: 'esposo', label: 'Esposo' },
  { value: 'esposa', label: 'Esposa' },
  { value: 'irmao', label: 'Irmão' },
  { value: 'irma', label: 'Irmã' },
  { value: 'outro', label: 'Outro' },
] as const;

export type Relationship = (typeof RELATIONSHIPS)[number]['value'];

export const RELATIONSHIP_LABELS: Record<Relationship, string> = Object.fromEntries(
  RELATIONSHIPS.map((r) => [r.value, r.label])
) as Record<Relationship, string>;

export interface Actor {
  userId: string;
  name: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  username?: string;
}

export interface Visitor {
  _id: string;
  name: string;
  relationship: Relationship;
  city: string;
  visitDate: string;
  createdBy?: Actor;
  createdAt: string;
}

export interface PrayerRequest {
  _id: string;
  name: string;
  request: string;
  source: 'porteiro' | 'live';
  isAnonymous: boolean;
  createdBy?: Actor;
  createdAt: string;
}

export interface CreateVisitorDto {
  visitors: Array<{
    name: string;
    relationship: Relationship;
    city: string;
  }>;
}

export interface CreatePrayerDto {
  name: string;
  request: string;
  source: 'porteiro' | 'live';
  isAnonymous: boolean;
}

export interface Hymn {
  title: string;
  artist: string;
  performedBy: string;
  addedBy?: Actor;
}

export interface Service {
  _id: string;
  title: string;
  date: string;
  time?: string;
  hymns: Hymn[];
  createdBy?: Actor;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServiceDto {
  title: string;
  date: string;
  time?: string;
  hymns?: Hymn[];
  recurring?: boolean;
}

export interface CreateServiceResponse {
  service: Service;
  createdCount: number;
}

export interface UpdateServiceDto {
  title: string;
  date: string;
  time?: string;
  hymns: Hymn[];
}

export function formatVisitor(visitor: Pick<Visitor, 'name' | 'relationship'>): string {
  const label = RELATIONSHIP_LABELS[visitor.relationship] ?? visitor.relationship;
  return `${visitor.name} (${label})`;
}
