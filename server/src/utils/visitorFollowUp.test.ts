import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addCalendarDays,
  dateKeyInZone,
  isValidFollowUpPhone,
  normalizeFollowUpPhone,
  resolveNextContactAt,
} from './visitorFollowUp.js';

test('telefone do acompanhamento guarda só dígitos e valida DDD', () => {
  assert.equal(normalizeFollowUpPhone('(44) 99999-0000'), '44999990000');
  assert.equal(isValidFollowUpPhone('44999990000'), true);
  assert.equal(isValidFollowUpPhone('123'), false);
  assert.equal(normalizeFollowUpPhone({ churchId: 'x' }), '');
});

test('primeiro contato usa o fuso da igreja e não mistura datas', () => {
  const now = new Date('2026-09-09T15:00:00.000Z');
  const tomorrow = resolveNextContactAt('tomorrow', undefined, now, 'America/Sao_Paulo');
  assert.equal(dateKeyInZone(tomorrow.date!, 'America/Sao_Paulo'), '2026-09-10');
  const custom = resolveNextContactAt('custom', '2026-09-20', now, 'America/Sao_Paulo');
  assert.equal(dateKeyInZone(custom.date!, 'America/Sao_Paulo'), '2026-09-20');
  const today = addCalendarDays(now, 0, 'America/Sao_Paulo');
  assert.equal(dateKeyInZone(today, 'America/Sao_Paulo'), '2026-09-09');
});
