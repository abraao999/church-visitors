import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseDateOnly } from './dayRange.js';
import {
  buildOccurrenceDates,
  combineDateAndTime,
  previewLimitsError,
  resolveServiceStatus,
  windowsOverlap,
} from './serviceSchedule.js';

const sunday = parseDateOnly('2026-09-13')!;

describe('horários e situações do culto', () => {
  test('culto único usa o fuso da igreja, não o UTC da máquina', () => {
    const start = combineDateAndTime(sunday, '19:00');
    assert.ok(start);
    assert.equal(start.toISOString(), '2026-09-13T22:00:00.000Z');
  });

  test('fica agendado antes da abertura de 30 minutos', () => {
    const service = { date: sunday, time: '19:00', durationMinutes: 120 };
    assert.equal(resolveServiceStatus(service, new Date('2026-09-13T21:29:59.000Z')), 'scheduled');
  });

  test('abre a recepção exatamente 30 minutos antes', () => {
    const service = { date: sunday, time: '19:00', durationMinutes: 120 };
    assert.equal(resolveServiceStatus(service, new Date('2026-09-13T21:30:00.000Z')), 'reception_open');
  });

  test('entra em andamento no horário oficial', () => {
    const service = { date: sunday, time: '19:00', durationMinutes: 120 };
    assert.equal(resolveServiceStatus(service, new Date('2026-09-13T22:00:00.000Z')), 'in_progress');
  });

  test('encerra automaticamente no fim da duração', () => {
    const service = { date: sunday, time: '19:00', durationMinutes: 120 };
    assert.equal(resolveServiceStatus(service, new Date('2026-09-14T00:00:00.000Z')), 'closed');
  });

  test('extensão manual atrasa o encerramento', () => {
    const service = {
      date: sunday,
      time: '19:00',
      durationMinutes: 120,
      extendedUntil: new Date('2026-09-14T00:30:00.000Z'),
    };
    assert.equal(resolveServiceStatus(service, new Date('2026-09-14T00:15:00.000Z')), 'in_progress');
    assert.equal(resolveServiceStatus(service, new Date('2026-09-14T00:30:00.000Z')), 'closed');
  });

  test('encerramento antecipado prevalece', () => {
    const service = {
      date: sunday,
      time: '19:00',
      durationMinutes: 120,
      closedAt: new Date('2026-09-13T22:10:00.000Z'),
    };
    assert.equal(resolveServiceStatus(service, new Date('2026-09-13T22:20:00.000Z')), 'closed');
  });

  test('ocorrência cancelada não abre', () => {
    const service = {
      date: sunday,
      time: '19:00',
      cancelledAt: new Date('2026-09-13T10:00:00.000Z'),
    };
    assert.equal(resolveServiceStatus(service, new Date('2026-09-13T21:45:00.000Z')), 'cancelled');
  });
});

describe('recorrência', () => {
  test('série semanal respeita a data final', () => {
    const dates = buildOccurrenceDates({
      startDate: sunday,
      endDate: parseDateOnly('2026-10-04')!,
      frequency: 'weekly',
    });
    assert.equal(dates.length, 4);
  });

  test('série quinzenal pula uma semana', () => {
    const dates = buildOccurrenceDates({
      startDate: sunday,
      endDate: parseDateOnly('2026-10-11')!,
      frequency: 'biweekly',
    });
    assert.equal(dates.length, 3);
  });

  test('limite de 100 ocorrências é recusado com data longa demais', () => {
    const error = previewLimitsError(sunday, parseDateOnly('2028-09-13')!, 'weekly');
    assert.ok(error);
  });
});

describe('fuso da igreja', () => {
  test('Manaus não usa o UTC da Vercel para abrir a recepção', () => {
    const start = combineDateAndTime(sunday, '19:00', 'America/Manaus');
    assert.ok(start);
    assert.equal(start.toISOString(), '2026-09-13T23:00:00.000Z');
    const service = { date: sunday, time: '19:00', durationMinutes: 120 };
    assert.equal(
      resolveServiceStatus(service, new Date('2026-09-13T22:29:59.000Z'), 'America/Manaus'),
      'scheduled'
    );
    assert.equal(
      resolveServiceStatus(service, new Date('2026-09-13T22:30:00.000Z'), 'America/Manaus'),
      'reception_open'
    );
  });
});

describe('sobreposição', () => {
  test('detecta janelas que se cruzam', () => {
    assert.equal(
      windowsOverlap(
        { start: new Date('2026-09-13T21:30:00Z'), end: new Date('2026-09-14T00:00:00Z') },
        { start: new Date('2026-09-13T23:00:00Z'), end: new Date('2026-09-14T01:00:00Z') }
      ),
      true
    );
    assert.equal(
      windowsOverlap(
        { start: new Date('2026-09-13T21:30:00Z'), end: new Date('2026-09-14T00:00:00Z') },
        { start: new Date('2026-09-14T00:00:00Z'), end: new Date('2026-09-14T02:00:00Z') }
      ),
      false
    );
  });
});
