import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPortariaDeviceToken,
  createPortariaPairingToken,
  createPortariaPublicId,
  parseCapturedAt,
  parsePortariaPermissions,
  parsePortariaToken,
  verifyPortariaDeviceSignature,
  verifyPortariaPairingSignature,
} from './portariaToken.js';
import { createGuestPublicId, createGuestToken } from './guestToken.js';

process.env.GUEST_ACCESS_SECRET = 'teste-guest-portaria-token-chave-longa-654321';
process.env.JWT_SECRET = 'teste-jwt-portaria-token-chave-longa-123456ab';

test('credencial do aparelho não é intercambiável com o token de convidado', () => {
  const publicId = createPortariaPublicId();
  const device = createPortariaDeviceToken(publicId, 1);
  const pairing = createPortariaPairingToken(publicId);
  const guest = createGuestToken(createGuestPublicId(), 1);

  const parsedDevice = parsePortariaToken(device);
  const parsedPairing = parsePortariaToken(pairing);
  assert.ok(parsedDevice);
  assert.ok(parsedPairing);
  assert.equal(verifyPortariaDeviceSignature(parsedDevice, 1), true);
  assert.equal(verifyPortariaPairingSignature(parsedPairing), true);
  assert.equal(verifyPortariaDeviceSignature(parsedPairing, 1), false);
  assert.equal(verifyPortariaPairingSignature(parsedDevice), false);
  assert.equal(device === guest, false);
  assert.equal(verifyPortariaDeviceSignature(parsePortariaToken(guest)!, 1), false);
});

test('versão da credencial invalida o token anterior', () => {
  const publicId = createPortariaPublicId();
  const parsed = parsePortariaToken(createPortariaDeviceToken(publicId, 1));
  assert.ok(parsed);
  assert.equal(verifyPortariaDeviceSignature(parsed, 2), false);
});

test('horário de captura fora do limite vai para revisão', () => {
  const now = new Date('2026-09-07T18:00:00.000Z');
  const ok = parseCapturedAt(now.toISOString(), now);
  assert.ok(ok instanceof Date);

  const future = parseCapturedAt(new Date(now.getTime() + 20 * 60_000).toISOString(), now);
  assert.ok(!('getTime' in future));
  assert.match(future.error, /adiantado/);

  const stale = parseCapturedAt(new Date(now.getTime() - 9 * 24 * 60 * 60_000).toISOString(), now);
  assert.ok(!('getTime' in stale));
  assert.match(stale.error, /tempo demais/);
});

test('permissões enviadas pelo aparelho são filtradas', () => {
  assert.deepEqual(
    parsePortariaPermissions([
      'offline_visitors:create',
      'prayers:create',
      'visitors:read',
      'offline_vehicle_notices:create',
      'offline_visitors:create',
    ]),
    ['offline_visitors:create', 'offline_vehicle_notices:create']
  );
});
