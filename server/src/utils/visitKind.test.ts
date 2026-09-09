import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { hasMixedFamilyVisitKinds } from './visitKind.js';

describe('tipo de visita da família', () => {
  test('aceita uma única resposta aplicada a todas as pessoas', () => {
    assert.equal(
      hasMixedFamilyVisitKinds([{ visitKind: 'first' }, { visitKind: 'first' }]),
      false
    );
  });

  test('identifica respostas diferentes dentro do mesmo cadastro', () => {
    assert.equal(
      hasMixedFamilyVisitKinds([{ visitKind: 'first' }, { visitKind: 'returning' }]),
      true
    );
  });
});
