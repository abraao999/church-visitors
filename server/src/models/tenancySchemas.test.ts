import assert from 'node:assert/strict';
import test from 'node:test';
import { Church } from './Church.js';
import { HolyricsSettings } from './HolyricsSettings.js';
import { GuestAccess } from './GuestAccess.js';
import { TeamInvitation } from './TeamInvitation.js';
import { PublicRateLimit } from './PublicRateLimit.js';
import { PrayerRequest } from './PrayerRequest.js';
import { RecurrenceSeries } from './RecurrenceSeries.js';
import { Service } from './Service.js';
import { User } from './User.js';
import { Visitor } from './Visitor.js';
import { VisitorFollowUp } from './VisitorFollowUp.js';
import { FollowUpContact } from './FollowUpContact.js';
import { VehicleNotice } from './VehicleNotice.js';
import { PortariaDevice } from './PortariaDevice.js';
import { PortariaPairing } from './PortariaPairing.js';
import { createChurchSlug, normalizeChurchName } from '../utils/church.js';

function hasIndex(
  indexes: ReturnType<typeof Visitor.schema.indexes>,
  fields: Record<string, number>,
  options: Record<string, unknown> = {}
): boolean {
  return indexes.some(([indexedFields, indexedOptions]) => {
    const fieldsMatch = JSON.stringify(indexedFields) === JSON.stringify(fields);
    const normalizedOptions = indexedOptions as Record<string, unknown>;
    const optionsMatch = Object.entries(options).every(
      ([key, value]) => JSON.stringify(normalizedOptions[key]) === JSON.stringify(value)
    );
    return fieldsMatch && optionsMatch;
  });
}

test('Church define identidade, estado e timestamps', () => {
  assert.equal(Church.schema.path('name').isRequired, true);
  assert.equal(Church.schema.path('slug').isRequired, true);
  assert.ok(Church.schema.path('active'));
  assert.ok(Church.schema.path('createdAt'));
  assert.ok(Church.schema.path('updatedAt'));
  assert.ok(Church.schema.path('branding'));
  assert.ok(Church.schema.path('branding.logoUrl'));
  assert.ok(Church.schema.path('branding.primaryColor'));
});

test('modelos privados possuem churchId obrigatório e índices compostos de isolamento', () => {
  assert.equal(User.schema.path('churchId').isRequired, true);
  assert.ok(User.schema.path('role'));

  assert.equal(Visitor.schema.path('churchId').isRequired, true);
  assert.ok(hasIndex(Visitor.schema.indexes(), { churchId: 1, createdAt: -1 }));
  assert.ok(
    hasIndex(Visitor.schema.indexes(), { churchId: 1, requestId: 1 }, {
      unique: true,
      partialFilterExpression: { requestId: { $type: 'string' } },
    })
  );

  assert.equal(PrayerRequest.schema.path('churchId').isRequired, true);
  assert.ok(hasIndex(PrayerRequest.schema.indexes(), { churchId: 1, createdAt: -1 }));
  assert.ok(
    hasIndex(
      PrayerRequest.schema.indexes(),
      { churchId: 1, requestId: 1 },
      {
        unique: true,
        partialFilterExpression: { requestId: { $type: 'string' } },
      }
    )
  );

  assert.equal(Service.schema.path('churchId').isRequired, true);
  assert.ok(hasIndex(Service.schema.indexes(), { churchId: 1, date: 1 }));
  assert.ok(hasIndex(Service.schema.indexes(), { churchId: 1, scheduledStartAt: 1 }));
  assert.ok(
    hasIndex(
      Service.schema.indexes(),
      { churchId: 1, recurrenceSeriesId: 1, scheduledStartAt: 1 },
      { unique: true, sparse: true }
    )
  );

  assert.equal(RecurrenceSeries.schema.path('churchId').isRequired, true);
  assert.ok(hasIndex(RecurrenceSeries.schema.indexes(), { churchId: 1, active: 1, startDate: 1 }));
  assert.ok(
    hasIndex(
      RecurrenceSeries.schema.indexes(),
      { churchId: 1, requestId: 1 },
      {
        unique: true,
        partialFilterExpression: { requestId: { $type: 'string' } },
      }
    )
  );

  assert.ok(hasIndex(Visitor.schema.indexes(), { churchId: 1, serviceId: 1, createdAt: -1 }));

  assert.equal(VisitorFollowUp.schema.path('churchId').isRequired, true);
  assert.equal(VisitorFollowUp.schema.path('visitorId').isRequired, true);
  assert.ok(hasIndex(VisitorFollowUp.schema.indexes(), { churchId: 1, visitorId: 1 }, { unique: true }));
  assert.ok(hasIndex(VisitorFollowUp.schema.indexes(), { churchId: 1, status: 1, nextContactAt: 1 }));
  assert.equal(FollowUpContact.schema.path('churchId').isRequired, true);
  assert.equal(FollowUpContact.schema.path('followUpId').isRequired, true);
  assert.ok(hasIndex(FollowUpContact.schema.indexes(), { churchId: 1, followUpId: 1, createdAt: -1 }));
  assert.ok(hasIndex(PrayerRequest.schema.indexes(), { churchId: 1, serviceId: 1, createdAt: -1 }));
  assert.ok(hasIndex(VehicleNotice.schema.indexes(), { churchId: 1, serviceId: 1, createdAt: -1 }));
  assert.ok(Church.schema.path('timezone'));
  assert.ok(Church.schema.path('visitorFollowUpEnabled'));

  assert.equal(HolyricsSettings.schema.path('churchId').isRequired, true);
  assert.ok(hasIndex(HolyricsSettings.schema.indexes(), { churchId: 1 }, { unique: true }));

  assert.equal(VehicleNotice.schema.path('churchId').isRequired, true);
  assert.ok(hasIndex(VehicleNotice.schema.indexes(), { churchId: 1, status: 1, createdAt: -1 }));
  assert.ok(
    hasIndex(VehicleNotice.schema.indexes(), { churchId: 1, plateNormalized: 1, createdAt: -1 })
  );
  assert.equal(hasIndex(VehicleNotice.schema.indexes(), { plateNormalized: 1 }), false);
  assert.ok(hasIndex(VehicleNotice.schema.indexes(), { guestAccessId: 1, createdAt: -1 }));
  assert.ok(
    hasIndex(VehicleNotice.schema.indexes(), { churchId: 1, requestId: 1 }, {
      unique: true,
      partialFilterExpression: { requestId: { $type: 'string' } },
    })
  );

  assert.equal(GuestAccess.schema.path('churchId').isRequired, true);
  assert.ok(hasIndex(GuestAccess.schema.indexes(), { publicId: 1 }, { unique: true }));
  assert.ok(hasIndex(GuestAccess.schema.indexes(), { churchId: 1, active: 1 }));

  assert.equal(PortariaDevice.schema.path('churchId').isRequired, true);
  assert.ok(hasIndex(PortariaDevice.schema.indexes(), { publicId: 1 }, { unique: true }));
  assert.ok(hasIndex(PortariaDevice.schema.indexes(), { churchId: 1, active: 1, createdAt: -1 }));
  assert.equal(PortariaPairing.schema.path('churchId').isRequired, true);
  assert.ok(hasIndex(PortariaPairing.schema.indexes(), { publicId: 1 }, { unique: true }));

  assert.equal(TeamInvitation.schema.path('churchId').isRequired, true);
  assert.ok(hasIndex(TeamInvitation.schema.indexes(), { publicId: 1 }, { unique: true }));
  assert.ok(hasIndex(TeamInvitation.schema.indexes(), { churchId: 1, status: 1, createdAt: -1 }));

  assert.ok(
    hasIndex(PublicRateLimit.schema.indexes(), { expiresAt: 1 }, { expireAfterSeconds: 0 })
  );
});

test('slug é apenas apresentacional, normalizado e recebe entropia', () => {
  assert.equal(normalizeChurchName('  Igreja   Esperança  '), 'Igreja Esperança');
  const first = createChurchSlug('Igreja Esperança');
  const second = createChurchSlug('Igreja Esperança');
  assert.match(first, /^igreja-esperanca-[a-f0-9]{8}$/);
  assert.notEqual(first, second);
});
