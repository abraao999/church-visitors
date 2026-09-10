export type Municipality = readonly [name: string, uf: string];

export function normalizeCityInput(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
}

export function municipalityLabel(name: string, uf: string): string {
  return `${name} — ${uf}`;
}

function fold(value: string): string {
  return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{M}/gu, '');
}

export function filterMunicipalities(
  catalog: readonly Municipality[],
  query: string,
  limit = 8
): Array<{ name: string; uf: string; label: string }> {
  const raw = query.trim();
  if (!raw) return [];
  const needle = fold(raw);
  const matches: Array<{ name: string; uf: string; label: string }> = [];
  for (const [name, uf] of catalog) {
    const hay = fold(`${name} ${uf}`);
    if (!hay.includes(needle)) continue;
    matches.push({ name, uf, label: municipalityLabel(name, uf) });
    if (matches.length >= limit) break;
  }
  return matches;
}

let catalogPromise: Promise<readonly Municipality[]> | null = null;

export function loadMunicipalities(): Promise<readonly Municipality[]> {
  catalogPromise ??= import('../data/brMunicipalities.json').then(
    (module) => module.default as unknown as Municipality[]
  );
  return catalogPromise;
}
