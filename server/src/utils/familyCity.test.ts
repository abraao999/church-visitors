import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { hasMixedFamilyCities, normalizeFamilyCity } from './familyCity.js';

describe('cidade da família', () => {
  test('normaliza espaços e capitalização', () => {
    assert.equal(normalizeFamilyCity('  umuarama   do  sul '), 'UMUARAMA DO SUL');
  });

  test('aceita a mesma cidade para todas as pessoas', () => {
    assert.equal(
      hasMixedFamilyCities([{ city: 'Umuarama' }, { city: '  UMUARAMA ' }]),
      false
    );
  });

  test('identifica cidades diferentes no mesmo cadastro', () => {
    assert.equal(
      hasMixedFamilyCities([{ city: 'Umuarama' }, { city: 'Maria Helena' }]),
      true
    );
  });
});
