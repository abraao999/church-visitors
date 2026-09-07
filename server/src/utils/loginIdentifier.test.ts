import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readLoginIdentifier } from './loginIdentifier.js';

describe('readLoginIdentifier', () => {
  test('usa login e aceita o campo antigo email', () => {
    assert.equal(readLoginIdentifier({ login: ' Ana@Igreja.Test ' }), 'ana@igreja.test');
    assert.equal(readLoginIdentifier({ email: ' Ana@Igreja.Test ' }), 'ana@igreja.test');
    assert.equal(readLoginIdentifier({ login: 'usuario', email: 'outro@igreja.test' }), 'usuario');
    assert.equal(readLoginIdentifier({}), '');
  });
});
