import assert from 'node:assert/strict';
import test from 'node:test';
import { Types } from 'mongoose';
import { serviceStatusAtCapture } from './activeService.js';
import type { IService } from '../models/Service.js';

function service(partial: Partial<IService>): IService {
  return {
    _id: new Types.ObjectId(),
    churchId: new Types.ObjectId(),
    title: 'Culto da noite',
    date: new Date('2026-09-07T00:00:00.000Z'),
    time: '19:00',
    scheduledStartAt: new Date('2026-09-07T22:00:00.000Z'),
    durationMinutes: 120,
    activationLeadMinutes: 30,
    ...partial,
  } as IService;
}

test('captura durante a recepção associa o culto mesmo se ele já foi encerrado', () => {
  const capturedAt = new Date('2026-09-07T21:40:00.000Z');
  const status = serviceStatusAtCapture(
    service({ closedAt: new Date('2026-09-08T01:00:00.000Z') }),
    capturedAt,
    'America/Sao_Paulo'
  );
  assert.equal(status, 'reception_open');
});

test('captura durante o culto associa pelo horário, não pelo momento da sincronização', () => {
  const capturedAt = new Date('2026-09-07T22:30:00.000Z');
  const status = serviceStatusAtCapture(
    service({ closedAt: new Date('2026-09-08T01:10:00.000Z') }),
    capturedAt,
    'America/Sao_Paulo'
  );
  assert.equal(status, 'in_progress');
});

test('captura depois do encerramento não associa aquele culto', () => {
  const capturedAt = new Date('2026-09-08T01:20:00.000Z');
  const status = serviceStatusAtCapture(
    service({ closedAt: new Date('2026-09-08T01:00:00.000Z') }),
    capturedAt,
    'America/Sao_Paulo'
  );
  assert.equal(status, 'closed');
});
