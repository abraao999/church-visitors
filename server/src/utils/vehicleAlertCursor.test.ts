import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Types } from 'mongoose';
import {
  alertCursorFilter,
  encodeVehicleAlertCursor,
  parseVehicleAlertCursor,
} from './vehicleAlertCursor.js';

describe('cursor de alertas de veículos', () => {
  test('codifica e decodifica data e id', () => {
    const id = new Types.ObjectId().toHexString();
    const createdAt = new Date('2026-09-07T20:15:30.123Z');
    const cursor = encodeVehicleAlertCursor(createdAt, id);
    const parsed = parseVehicleAlertCursor(cursor);
    assert.ok(parsed);
    assert.equal(parsed.createdAt.toISOString(), createdAt.toISOString());
    assert.equal(parsed.id, id);
  });

  test('recusa cursor de outra forma ou id inválido', () => {
    assert.equal(parseVehicleAlertCursor(''), null);
    assert.equal(parseVehicleAlertCursor('2026-09-07_abc'), null);
    assert.equal(parseVehicleAlertCursor('ontem_aaaaaaaaaaaaaaaaaaaaaaaa'), null);
  });

  test('dois avisos no mesmo instante ficam em ordem estável pelo id', () => {
    const createdAt = new Date('2026-09-07T20:15:30.000Z');
    const first = new Types.ObjectId();
    const second = new Types.ObjectId();
    const filter = alertCursorFilter(createdAt, String(first));
    assert.deepEqual(filter.$or[0], { createdAt: { $gt: createdAt } });
    assert.deepEqual(filter.$or[1], { createdAt, _id: { $gt: first } });
    assert.ok(String(second) !== String(first));
  });
});
