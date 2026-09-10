import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { filterMunicipalities, normalizeCityInput } from './citySuggest.ts';

const catalog = [
  ['Umuarama', 'PR'],
  ['Umuarama do Sul', 'PR'],
  ['Curitiba', 'PR'],
  ['Maringá', 'PR'],
] as const;

describe('sugestões de cidade', () => {
  test('normaliza espaços e capitalização no salvamento', () => {
    assert.equal(normalizeCityInput('  umuarama   do  sul '), 'UMUARAMA DO SUL');
  });

  test('filtra pelo texto digitado sem exigir correspondência exata', () => {
    assert.deepEqual(
      filterMunicipalities(catalog, 'umua').map((item) => item.label),
      ['Umuarama — PR', 'Umuarama do Sul — PR']
    );
  });

  test('ignora acentos na busca', () => {
    assert.equal(filterMunicipalities(catalog, 'maringa')[0]?.name, 'Maringá');
  });

  test('permite seguir com texto livre quando não há sugestão', () => {
    assert.deepEqual(filterMunicipalities(catalog, 'Cidade Inventada'), []);
    assert.equal(normalizeCityInput('Cidade Inventada'), 'CIDADE INVENTADA');
  });
});
