import assert from 'node:assert/strict';
import test from 'node:test';
import { validCronAuthorization } from './cronSecret.js';

test('rotina automática permanece bloqueada sem CRON_SECRET', () => {
  assert.equal(validCronAuthorization(undefined, undefined), false);
  assert.equal(validCronAuthorization('Bearer undefined', undefined), false);
});

test('rotina automática aceita somente o Bearer exato', () => {
  assert.equal(validCronAuthorization('segredo', 'segredo'), false);
  assert.equal(validCronAuthorization('Bearer outro', 'segredo'), false);
  assert.equal(validCronAuthorization('Bearer segredo', 'segredo'), true);
});
