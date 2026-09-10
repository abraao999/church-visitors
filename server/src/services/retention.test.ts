import assert from 'node:assert/strict';
import test from 'node:test';
import { Types } from 'mongoose';
import { GuestAccess } from '../models/GuestAccess.js';
import { PortariaDevice } from '../models/PortariaDevice.js';
import { PrayerRequest } from '../models/PrayerRequest.js';
import { RetentionPolicy } from '../models/RetentionPolicy.js';
import { RetentionRun } from '../models/RetentionRun.js';
import { TeamInvitation } from '../models/TeamInvitation.js';
import { VehicleNotice } from '../models/VehicleNotice.js';
import { Visitor } from '../models/Visitor.js';
import { FollowUpContact } from '../models/FollowUpContact.js';
import { VisitorFollowUp } from '../models/VisitorFollowUp.js';
import { Church } from '../models/Church.js';
import { ReportDailySummary } from '../models/ReportDailySummary.js';
import {
  buildRetentionFilters,
  defaultRetentionPolicy,
  parseRetentionPolicy,
  runRetentionPolicy,
  subtractMonths,
} from './retention.js';

function stubMethod(
  target: object,
  key: string,
  replacement: (...args: never[]) => unknown
) {
  const record = target as Record<string, unknown>;
  const original = record[key];
  record[key] = replacement;
  return () => {
    record[key] = original;
  };
}

test('a política nasce desativada com prazos conservadores', () => {
  assert.deepEqual(defaultRetentionPolicy(), {
    enabled: false,
    visitorsMonths: 24,
    prayersDays: 90,
    vehicleNoticesDays: 30,
    guestAccessesDays: 90,
    teamInvitationsDays: 90,
    portariaDevicesDays: 180,
  });
});

test('validação rejeita prazos fora dos limites', () => {
  const invalid = parseRetentionPolicy({
    ...defaultRetentionPolicy(),
    prayersDays: 1,
  });
  assert.equal(invalid.data, undefined);
  assert.match(invalid.error ?? '', /prayersDays/);

  const valid = parseRetentionPolicy({
    ...defaultRetentionPolicy(),
    enabled: true,
  });
  assert.equal(valid.data?.enabled, true);
});

test('subtração mensal preserva o fim do mês sem avançar a data', () => {
  const result = subtractMonths(new Date('2026-03-31T12:00:00.000Z'), 1);
  assert.equal(result.toISOString(), '2026-02-28T12:00:00.000Z');
});

test('todos os filtros de retenção ficam presos à igreja autenticada', () => {
  const churchId = new Types.ObjectId().toHexString();
  const otherChurchId = new Types.ObjectId();
  const filters = buildRetentionFilters(
    churchId,
    defaultRetentionPolicy(),
    new Date('2026-09-07T12:00:00.000Z')
  );

  for (const filter of [
    filters.visitors,
    filters.prayers,
    filters.vehicleNotices,
    filters.guestAccesses,
    filters.teamInvitations,
    filters.portariaDevices,
  ]) {
    assert.equal(filter.churchId.toHexString(), churchId);
    assert.notEqual(filter.churchId.toHexString(), otherChurchId.toHexString());
  }

  assert.deepEqual(filters.portariaDevices.active, false);
  assert.deepEqual(
    (filters.vehicleNotices.$or as Array<Record<string, unknown>>).map((item) => item.status ?? item.archived),
    ['resolved', true]
  );
});

test('execução anonimiza visitantes, exclui categorias vencidas e não guarda conteúdo no histórico', async () => {
  const churchId = new Types.ObjectId();
  const policyId = new Types.ObjectId();
  const seen: Record<string, unknown> = {};
  const restores = [
    stubMethod(RetentionPolicy, 'findOneAndUpdate', async (filter: never) => {
      seen.lockFilter = filter;
      return { _id: policyId, churchId, ...defaultRetentionPolicy(), enabled: true };
    }),
    stubMethod(RetentionPolicy, 'updateOne', async () => ({ modifiedCount: 1 })),
    stubMethod(Visitor, 'find', () => ({
      select() {
        return {
          lean: async () => [
            { _id: new Types.ObjectId(), city: 'Umuarama', source: 'owner', visitKind: 'first', visitDate: new Date('2024-01-01') },
            { _id: new Types.ObjectId(), city: 'Cianorte', source: 'owner', visitKind: 'unknown', visitDate: new Date('2024-01-02') },
          ],
        };
      },
    })),
    stubMethod(PrayerRequest, 'find', () => ({
      select() {
        return { lean: async () => [{ createdAt: new Date('2024-01-01') }] };
      },
    })),
    stubMethod(VehicleNotice, 'find', () => ({
      select() {
        return { lean: async () => [{ createdAt: new Date('2024-01-01') }] };
      },
    })),
    stubMethod(Church, 'findById', () => ({
      select: async () => ({ timezone: 'America/Sao_Paulo' }),
    })),
    stubMethod(ReportDailySummary, 'findOne', async () => null),
    stubMethod(ReportDailySummary, 'updateOne', async (_filter: never, update: never) => {
      seen.summaryUpdate = update;
      return { modifiedCount: 1 };
    }),
    stubMethod(Visitor, 'updateMany', async (filter: never, update: never) => {
      seen.visitorFilter = filter;
      seen.visitorUpdate = update;
      return { modifiedCount: 2 };
    }),
    stubMethod(VisitorFollowUp, 'find', () => ({
      select() {
        return { lean: async () => [{ createdAt: new Date('2024-01-02'), status: 'awaiting' }] };
      },
    })),
    stubMethod(FollowUpContact, 'find', () => ({
      select() {
        return { lean: async () => [{ createdAt: new Date('2024-01-02') }] };
      },
    })),
    stubMethod(FollowUpContact, 'deleteMany', async () => ({ deletedCount: 2 })),
    stubMethod(VisitorFollowUp, 'updateMany', async () => ({ modifiedCount: 2 })),
    stubMethod(PrayerRequest, 'deleteMany', async (filter: never) => {
      seen.prayerFilter = filter;
      return { deletedCount: 3 };
    }),
    stubMethod(VehicleNotice, 'deleteMany', async () => ({ deletedCount: 4 })),
    stubMethod(GuestAccess, 'deleteMany', async () => ({ deletedCount: 5 })),
    stubMethod(TeamInvitation, 'deleteMany', async () => ({ deletedCount: 6 })),
    stubMethod(PortariaDevice, 'deleteMany', async () => ({ deletedCount: 7 })),
    stubMethod(RetentionRun, 'create', async (document: never) => {
      seen.run = document;
      return document;
    }),
  ];

  try {
    const summary = await runRetentionPolicy(policyId, 'automatic', new Date('2026-09-07T12:00:00.000Z'));
    assert.deepEqual(summary, {
      visitorsAnonymized: 2,
      prayersDeleted: 3,
      vehicleNoticesDeleted: 4,
      guestAccessesDeleted: 5,
      teamInvitationsDeleted: 6,
      portariaDevicesDeleted: 7,
    });
    assert.equal((seen.lockFilter as { enabled: boolean }).enabled, true);
    assert.equal(
      ((seen.visitorFilter as { churchId: Types.ObjectId }).churchId).toHexString(),
      churchId.toHexString()
    );
    assert.equal(
      ((seen.prayerFilter as { churchId: Types.ObjectId }).churchId).toHexString(),
      churchId.toHexString()
    );
    const visitorUpdate = seen.visitorUpdate as {
      $set: { name: string };
      $unset: Record<string, number>;
    };
    assert.equal(visitorUpdate.$set.name, 'VISITANTE ANONIMIZADO');
    assert.equal(visitorUpdate.$unset.createdBy, 1);
    assert.equal(visitorUpdate.$unset.guestAccess, 1);
    const summaryUpdate = seen.summaryUpdate as {
      $inc?: Record<string, number>;
      $set?: { cities?: Record<string, number>; visitorSources?: Record<string, number> };
    };
    assert.ok(summaryUpdate.$inc);
    assert.equal('name' in (summaryUpdate.$inc || {}), false);
    assert.equal('phone' in (summaryUpdate.$set || {}), false);
    assert.equal('request' in (summaryUpdate.$inc || {}), false);
    assert.ok(summaryUpdate.$inc);
    assert.equal('phone' in (summaryUpdate.$inc || {}), false);
    assert.ok((summaryUpdate.$inc?.followUps ?? 0) >= 0);
    assert.ok((summaryUpdate.$inc?.followUpContacts ?? 0) >= 0);

    const run = seen.run as Record<string, unknown>;
    assert.deepEqual(Object.keys(run).sort(), [
      'churchId',
      'completedAt',
      'expiresAt',
      'startedAt',
      'status',
      'summary',
      'trigger',
    ]);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
