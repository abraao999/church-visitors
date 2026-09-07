import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import {
  allowedCorsOrigins,
  CONTENT_SECURITY_POLICY,
  isAllowedOrigin,
  securityHeaders,
} from './httpSecurity.js';

describe('origens permitidas no CORS', () => {
  test('em desenvolvimento inclui o Vite local', () => {
    const origins = allowedCorsOrigins({ NODE_ENV: 'development' });
    assert.ok(origins.includes('http://localhost:5173'));
    assert.ok(origins.includes('http://127.0.0.1:5173'));
  });

  test('em produção não libera localhost, só o domínio configurado', () => {
    const origins = allowedCorsOrigins({
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://igreja.exemplo.com',
    });
    assert.deepEqual(origins, ['https://igreja.exemplo.com']);
  });

  test('na Vercel aceita a URL do deploy e a URL de produção', () => {
    const origins = allowedCorsOrigins({
      NODE_ENV: 'production',
      VERCEL_URL: 'church-visitors-abc.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'app.igreja.com',
    });
    assert.ok(origins.includes('https://church-visitors-abc.vercel.app'));
    assert.ok(origins.includes('https://app.igreja.com'));
    assert.equal(origins.some((origin) => origin.includes('localhost')), false);
  });

  test('origem desconhecida é recusada', () => {
    const env = { NODE_ENV: 'production', APP_ORIGIN: 'https://app.igreja.com' };
    assert.equal(isAllowedOrigin('https://app.igreja.com', env), true);
    assert.equal(isAllowedOrigin('https://site-malicioso.example', env), false);
  });
});

describe('cabeçalhos de segurança', () => {
  test('bloqueia iframe, cache de API e define CSP sem eval', () => {
    const headers: Record<string, string> = {};
    const req = {
      path: '/api/visitors',
      secure: false,
      get: () => undefined,
    } as unknown as Request;
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    } as unknown as Response;
    let nextCalled = false;
    const next = (() => {
      nextCalled = true;
    }) as NextFunction;

    securityHeaders(req, res, next);

    assert.equal(nextCalled, true);
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Referrer-Policy'], 'no-referrer');
    assert.equal(headers['Cache-Control'], 'private, no-store');
    assert.equal(headers['Content-Security-Policy'], CONTENT_SECURITY_POLICY);
    assert.equal(CONTENT_SECURITY_POLICY.includes('unsafe-eval'), false);
    assert.equal(CONTENT_SECURITY_POLICY.includes('fonts.googleapis.com'), false);
    assert.equal(CONTENT_SECURITY_POLICY.includes('fonts.gstatic.com'), false);
    assert.match(CONTENT_SECURITY_POLICY, /frame-ancestors 'none'/);
    assert.match(CONTENT_SECURITY_POLICY, /font-src 'self'/);
  });
});
