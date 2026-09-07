import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isLocalOrigin, resolvePublicOrigin } from './publicOrigin.ts';

describe('origem dos links e QR Codes', () => {
  test('sinaliza localhost, loopback e IPs privados', () => {
    assert.equal(isLocalOrigin('http://localhost:5173'), true);
    assert.equal(isLocalOrigin('http://127.0.0.1:3001'), true);
    assert.equal(isLocalOrigin('http://[::1]:5173'), true);
    assert.equal(isLocalOrigin('http://192.168.0.10'), true);
    assert.equal(isLocalOrigin('http://10.0.0.8'), true);
    assert.equal(isLocalOrigin('http://172.16.1.4'), true);
    assert.equal(isLocalOrigin('http://igreja.local'), true);
  });

  test('endereço público da igreja não é tratado como local', () => {
    assert.equal(isLocalOrigin('https://app.igreja.com'), false);
    assert.equal(isLocalOrigin('https://church-visitors.vercel.app'), false);
  });

  test('VITE_PUBLIC_ORIGIN substitui localhost na geração do link', () => {
    const resolved = resolvePublicOrigin(
      'http://localhost:5173',
      'https://app.igreja.com/'
    );
    assert.equal(resolved.origin, 'https://app.igreja.com');
    assert.equal(resolved.local, false);
  });

  test('sem origem configurada, localhost continua local', () => {
    const resolved = resolvePublicOrigin('http://localhost:5173');
    assert.equal(resolved.origin, 'http://localhost:5173');
    assert.equal(resolved.local, true);
  });
});
