import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';
import {
  SESSION_COOKIE,
  parseCookieHeader,
  readSessionToken,
  sessionCookieOptions,
  sessionUsesHttps,
} from './sessionCookie.js';

test('cookie httpOnly, SameSite=Lax e sem Secure em HTTP local', () => {
  const req = { secure: false, get: () => undefined } as unknown as Request;
  const options = sessionCookieOptions(req, {});
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, 'lax');
  assert.equal(options.path, '/');
  assert.equal(options.secure, false);
});

test('cookie Secure na Vercel', () => {
  const req = { secure: false, get: () => undefined } as unknown as Request;
  assert.equal(sessionUsesHttps(req, { VERCEL: '1' }), true);
  assert.equal(sessionCookieOptions(req, { VERCEL: '1' }).secure, true);
});

test('lê o JWT do cookie e, se não houver, do Authorization', () => {
  assert.deepEqual(parseCookieHeader(`${SESSION_COOKIE}=abc.def.ghi; other=1`), {
    [SESSION_COOKIE]: 'abc.def.ghi',
    other: '1',
  });

  const fromCookie = readSessionToken({
    headers: { cookie: `${SESSION_COOKIE}=cookie-token`, authorization: 'Bearer header-token' },
    secure: false,
    get: () => undefined,
  } as unknown as Request);
  assert.equal(fromCookie, 'cookie-token');

  const fromHeader = readSessionToken({
    headers: { authorization: 'Bearer header-token' },
    secure: false,
    get: () => undefined,
  } as unknown as Request);
  assert.equal(fromHeader, 'header-token');
});
