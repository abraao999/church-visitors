import assert from 'node:assert/strict';
import test from 'node:test';
import { parseExpectedUpdatedAt, sameInstant } from './optimistic.js';

test('updatedAt ISO válido vira Date', () => {
  const date = parseExpectedUpdatedAt('2026-09-07T12:00:00.000Z');
  assert.ok(date);
  assert.equal(date.toISOString(), '2026-09-07T12:00:00.000Z');
});

test('updatedAt ausente ou inválido é rejeitado', () => {
  assert.equal(parseExpectedUpdatedAt(undefined), null);
  assert.equal(parseExpectedUpdatedAt(''), null);
  assert.equal(parseExpectedUpdatedAt('ontem'), null);
});

test('compara o instante, não a string', () => {
  const stored = new Date('2026-09-07T12:00:00.000Z');
  assert.equal(sameInstant(stored, new Date('2026-09-07T12:00:00.000Z')), true);
  assert.equal(sameInstant(stored, new Date('2026-09-07T12:00:01.000Z')), false);
  assert.equal(sameInstant(undefined, stored), false);
});
