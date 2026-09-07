import assert from 'node:assert/strict';
import test from 'node:test';
import { countOccurrences, shiftToWeekday } from './serviceSchedule.ts';

test('contagem semanal e quinzenal no cliente acompanha o servidor', () => {
  assert.equal(countOccurrences('2026-09-13', '2026-10-04', 'weekly'), 4);
  assert.equal(countOccurrences('2026-09-13', '2026-10-11', 'biweekly'), 3);
});

test('o dia da semana desloca a primeira ocorrência para frente', () => {
  assert.equal(shiftToWeekday('2026-09-12', 0), '2026-09-13');
});
