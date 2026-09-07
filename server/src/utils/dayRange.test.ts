import assert from 'node:assert/strict';
import test from 'node:test';
import { endOfDay, parseDateOnly, startOfDay } from './dayRange.js';

test('o dia civil em São Paulo começa às 03:00 UTC (UTC−3)', () => {
  const noonUtc = new Date('2026-09-07T12:00:00.000Z');
  assert.equal(startOfDay(noonUtc).toISOString(), '2026-09-07T03:00:00.000Z');
  assert.equal(endOfDay(noonUtc).toISOString(), '2026-09-08T02:59:59.999Z');
});

test('culto noturno ainda conta como o mesmo dia, mesmo com o servidor em UTC', () => {
  // 21:30 em Brasília = 00:30 UTC do dia seguinte
  const evening = new Date('2026-09-08T00:30:00.000Z');
  assert.equal(startOfDay(evening).toISOString(), '2026-09-07T03:00:00.000Z');
  assert.equal(endOfDay(evening).toISOString(), '2026-09-08T02:59:59.999Z');
});

test('YYYY-MM-DD é o calendário de São Paulo, não o fuso do processo', () => {
  const date = parseDateOnly('2026-09-07');
  assert.ok(date);
  assert.equal(startOfDay(date).toISOString(), '2026-09-07T03:00:00.000Z');
  assert.equal(endOfDay(date).toISOString(), '2026-09-08T02:59:59.999Z');
});

test('data inválida é rejeitada', () => {
  assert.equal(parseDateOnly('07/09/2026'), null);
  assert.equal(parseDateOnly('2026-9-7'), null);
});
