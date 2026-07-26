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

export interface FamilyMember {
  name: string;
  relationship: Relationship;
}

export interface Visitor {
  _id: string;
  familyName: string;
  members: FamilyMember[];
  origin: string;
  visitDate: string;
  createdAt: string;
}

export interface PrayerRequest {
  _id: string;
  name: string;
  request: string;
  source: 'porteiro' | 'live';
  isAnonymous: boolean;
  createdAt: string;
}

export interface CreateVisitorDto {
  familyName: string;
  members: FamilyMember[];
  origin: string;
}

export interface CreatePrayerDto {
  name: string;
  request: string;
  source: 'porteiro' | 'live';
  isAnonymous: boolean;
}

export function formatMember(member: FamilyMember | string): string {
  if (typeof member === 'string') return member;
  const label = RELATIONSHIP_LABELS[member.relationship] ?? member.relationship;
  return `${member.name} (${label})`;
}
