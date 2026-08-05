export const RELATIONSHIPS = [
  'pai',
  'mae',
  'filho',
  'filha',
  'avo',
  'ava',
  'neto',
  'neta',
  'esposo',
  'esposa',
  'irmao',
  'irma',
  'outro',
] as const;

export type Relationship = (typeof RELATIONSHIPS)[number];
