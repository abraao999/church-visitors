import assert from 'node:assert/strict';
import test from 'node:test';
import { Church } from './Church.js';
import { HolyricsSettings } from './HolyricsSettings.js';
import { GuestAccess } from './GuestAccess.js';
import { PublicRateLimit } from './PublicRateLimit.js';
import { PrayerRequest } from './PrayerRequest.js';
import { Service } from './Service.js';
import { User } from './User.js';
import { Visitor } from './Visitor.js';
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
});

test('modelos privados possuem churchId e índices compostos de isolamento', () => {
  assert.ok(User.schema.path('churchId'));
  assert.ok(User.schema.path('role'));

  assert.ok(Visitor.schema.path('churchId'));
  assert.ok(hasIndex(Visitor.schema.indexes(), { churchId: 1, createdAt: -1 }));

  assert.ok(PrayerRequest.schema.path('churchId'));
  assert.ok(hasIndex(PrayerRequest.schema.indexes(), { churchId: 1, createdAt: -1 }));

  assert.ok(Service.schema.path('churchId'));
  assert.ok(hasIndex(Service.schema.indexes(), { churchId: 1, date: 1 }));

  assert.ok(HolyricsSettings.schema.path('churchId'));
  assert.ok(hasIndex(HolyricsSettings.schema.indexes(), { churchId: 1 }, { unique: true }));

  assert.equal(GuestAccess.schema.path('churchId').isRequired, true);
  assert.ok(hasIndex(GuestAccess.schema.indexes(), { publicId: 1 }, { unique: true }));
  assert.ok(hasIndex(GuestAccess.schema.indexes(), { churchId: 1, active: 1 }));

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
