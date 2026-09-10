import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  compareCounts,
  dateKeyInZone,
  previousEquivalentRange,
  resolveReportRange,
} from './reportRange.js';

describe('período dos relatórios', () => {
  test('este mês usa o fuso da igreja e não o UTC da máquina', () => {
    const now = new Date('2026-09-09T02:00:00.000Z');
    const resolved = resolveReportRange({
      preset: 'this_month',
      now,
      timeZone: 'America/Sao_Paulo',
    });
    assert.ok(resolved.range);
    assert.equal(resolved.range.fromKey, '2026-09-01');
    assert.equal(resolved.range.toKey, '2026-09-08');
  });

  test('período personalizado recusa intervalo invertido', () => {
    const resolved = resolveReportRange({
      preset: 'custom',
      from: '2026-09-10',
      to: '2026-09-01',
    });
    assert.match(resolved.error || '', /anterior/);
  });

  test('comparação usa intervalo imediatamente anterior da mesma duração', () => {
    const current = resolveReportRange({
      preset: 'custom',
      from: '2026-09-01',
      to: '2026-09-07',
      timeZone: 'America/Sao_Paulo',
    });
    assert.ok(current.range);
    const previous = previousEquivalentRange(current.range);
    assert.equal(previous.to.getTime() + 1, current.range.from.getTime());
    assert.equal(previous.to.getTime() - previous.from.getTime(), current.range.to.getTime() - current.range.from.getTime());
  });

  test('quando o período anterior é zero não inventa porcentagem', () => {
    const compare = compareCounts(12, 0);
    assert.equal(compare.percent, null);
    assert.equal(compare.delta, 12);
  });

  test('últimos 3 e 6 meses usam meses civis, não 90 ou 180 dias', () => {
    const now = new Date('2026-09-09T02:00:00.000Z');
    const three = resolveReportRange({
      preset: 'last_3_months',
      now,
      timeZone: 'America/Sao_Paulo',
    });
    const six = resolveReportRange({
      preset: 'last_6_months',
      now,
      timeZone: 'America/Sao_Paulo',
    });
    assert.ok(three.range);
    assert.ok(six.range);
    assert.equal(three.range.fromKey, '2026-06-01');
    assert.equal(three.range.toKey, '2026-09-08');
    assert.equal(six.range.fromKey, '2026-03-01');
    assert.equal(six.range.toKey, '2026-09-08');
  });

  test('a chave do dia segue o fuso da igreja', () => {
    assert.equal(dateKeyInZone(new Date('2026-09-09T02:30:00.000Z'), 'America/Sao_Paulo'), '2026-09-08');
  });
});
