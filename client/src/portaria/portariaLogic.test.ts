import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequestId } from '../utils/requestId.ts';
import { cachePolicyFor, navigationCacheKey } from '../pwa/cachePolicy.ts';
import { clockOffsetFrom, capturedAtFrom } from './clock.ts';
import { decryptPayload, encryptPayload, createQueueKey } from './crypto.ts';
import {
  isStaleQueue,
  nextBackoffMs,
  portariaPairingUrl,
  PORTARIA_START_URL,
  queueCapacity,
} from './constants.ts';
function visitorsSummary(payload: { visitors: Array<{ name: string }> }): string {
  const names = payload.visitors.map((person) => person.name).filter(Boolean);
  if (names.length <= 2) return names.join(' e ');
  return `${names[0]} e mais ${names.length - 1}`;
}
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('capacidade da fila alerta em 80 e bloqueia em 100', () => {
  assert.equal(queueCapacity(0), 'ok');
  assert.equal(queueCapacity(80), 'warn');
  assert.equal(queueCapacity(100), 'full');
});

test('espera progressiva cresce e tem teto', () => {
  assert.equal(nextBackoffMs(1), 2000);
  assert.equal(nextBackoffMs(2), 4000);
  assert.ok(nextBackoffMs(12) <= 5 * 60_000);
});

test('fila antiga de sete dias exige ação', () => {
  const now = Date.parse('2026-09-07T12:00:00.000Z');
  assert.equal(isStaleQueue(new Date(now - 6 * 24 * 60 * 60_000).toISOString(), now), false);
  assert.equal(isStaleQueue(new Date(now - 8 * 24 * 60 * 60_000).toISOString(), now), true);
});

test('horário capturado usa o deslocamento do servidor', () => {
  const offset = clockOffsetFrom('2026-09-07T15:00:00.000Z', Date.parse('2026-09-07T15:01:00.000Z'));
  assert.equal(offset.offsetMs, -60_000);
  assert.equal(capturedAtFrom(offset, Date.parse('2026-09-07T16:00:00.000Z')), '2026-09-07T15:59:00.000Z');
});

test('conteúdo da fila é criptografado com IV distinto', async () => {
  const key = await createQueueKey();
  const payload = { visitors: [{ name: 'Ana', city: 'Umuarama', relationship: 'outro' }] };
  const first = await encryptPayload(key, payload);
  const second = await encryptPayload(key, payload);
  assert.notEqual(Buffer.from(first.iv).toString('hex'), Buffer.from(second.iv).toString('hex'));
  assert.deepEqual(await decryptPayload(key, first.iv, first.data), payload);
});

test('resumo da família não lista todos os nomes', () => {
  assert.equal(
    visitorsSummary({
      visitors: [
        { name: 'Carlos', city: 'Umuarama', relationship: 'outro' },
        { name: 'Mariana', city: 'Umuarama', relationship: 'esposa' },
        { name: 'João', city: 'Umuarama', relationship: 'filho' },
      ],
    }),
    'Carlos e mais 2'
  );
});

test('requestId permanece estável e único por item', () => {
  const a = createRequestId();
  const b = createRequestId();
  assert.match(a, /^[A-Za-z0-9_-]{8,64}$/);
  assert.notEqual(a, b);
});

test('service worker não coloca API nem token de pareamento em cache', () => {
  assert.equal(cachePolicyFor(new URL('https://igreja.test/api/visitors')), 'network-only');
  assert.equal(cachePolicyFor(new URL('https://igreja.test/api/worship-panel')), 'network-only');
  assert.equal(
    cachePolicyFor(new URL('https://igreja.test/api/public-access/token/panels/worship')),
    'network-only'
  );
  assert.equal(cachePolicyFor(new URL('https://igreja.test/portaria?parear=abc')), 'network-only');
  assert.equal(cachePolicyFor(new URL('https://igreja.test/portaria')), 'network-first-nav');
  assert.equal(cachePolicyFor(new URL('https://igreja.test/assets/app-hash.js')), 'cache-first');
  assert.equal(navigationCacheKey(new URL('https://igreja.test/portaria/visitantes')), '/portaria');
});

test('manifesto da portaria não contém token e usa start_url estável', () => {
  const manifest = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../public/manifest.webmanifest'), 'utf8')
  );
  assert.equal(manifest.start_url, PORTARIA_START_URL);
  assert.equal(JSON.stringify(manifest).includes('parear'), false);
  assert.equal(JSON.stringify(manifest).includes('token'), false);
});

test('link de pareamento não vira start_url', () => {
  const url = portariaPairingUrl('abc.def', 'https://igreja.test');
  assert.equal(url.startsWith('https://igreja.test/portaria?parear='), true);
  assert.equal(PORTARIA_START_URL.includes('parear'), false);
});
