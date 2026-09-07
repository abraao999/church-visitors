import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Types } from 'mongoose';
import {
  serializePrayerRequest,
  serializeService,
  serializeVisitor,
} from './publicRecord.js';

describe('recortes das APIs privadas', () => {
  test('visitante não leva churchId nem ids de quem registrou', () => {
    const churchId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const guestAccessId = new Types.ObjectId();

    const createdBy = { userId, churchId, name: 'Responsável' };
    const guestAccess = {
      guestAccessId,
      name: 'Portaria',
      type: 'visitors:create',
    };

    const body = serializeVisitor({
      _id: new Types.ObjectId(),
      name: 'João',
      relationship: 'filho',
      city: 'Campinas',
      visitDate: new Date('2026-09-07T12:00:00Z'),
      source: 'guest_access',
      createdBy,
      guestAccess,
      createdAt: new Date('2026-09-07T12:00:00Z'),
    });

    assert.equal(body.name, 'João');
    assert.equal(body.city, 'Campinas');
    assert.equal('churchId' in body, false);
    assert.deepEqual(body.createdBy, { name: 'Responsável' });
    assert.deepEqual(body.guestAccess, { name: 'Portaria' });
    assert.equal(JSON.stringify(body).includes(String(churchId)), false);
    assert.equal(JSON.stringify(body).includes(String(userId)), false);
    assert.equal(JSON.stringify(body).includes(String(guestAccessId)), false);
  });

  test('pedido de oração não leva churchId nem userId', () => {
    const churchId = new Types.ObjectId();
    const userId = new Types.ObjectId();

    const createdBy = { userId, churchId, name: 'Responsável' };

    const body = serializePrayerRequest({
      _id: new Types.ObjectId(),
      name: 'Ana',
      request: 'Ore por nós',
      source: 'owner',
      isAnonymous: false,
      allowProjection: true,
      createdBy,
      createdAt: new Date(),
    });

    assert.equal(body.allowProjection, true);
    assert.equal('churchId' in body, false);
    assert.deepEqual(body.createdBy, { name: 'Responsável' });
    assert.equal(JSON.stringify(body).includes(String(userId)), false);
  });

  test('culto só envia o nome de quem adicionou o louvor', () => {
    const userId = new Types.ObjectId();
    const actor = { userId, name: 'Maria' };
    const body = serializeService({
      _id: new Types.ObjectId(),
      title: 'Culto da noite',
      date: new Date('2026-09-06T00:00:00Z'),
      time: '19:00',
      hymns: [
        {
          title: 'Grande é o Senhor',
          artist: 'Adoradores',
          performedBy: 'Ministério',
          addedBy: actor,
        },
      ],
      createdBy: actor,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const hymn = body.hymns[0];
    assert.ok(hymn);
    assert.equal(hymn.addedBy?.name, 'Maria');
    assert.equal('userId' in (hymn.addedBy ?? {}), false);
    assert.equal(JSON.stringify(body).includes(String(userId)), false);
    assert.equal('churchId' in body, false);
  });
});
