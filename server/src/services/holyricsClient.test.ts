import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  HOLYRICS_GENERIC_FAILURE,
  HOLYRICS_INTERNET_UNREACHABLE,
  HOLYRICS_INVALID_RESPONSE,
  HOLYRICS_LOCAL_UNREACHABLE,
  HOLYRICS_REJECTED,
  holyricsPublicError,
  holyricsRequest,
  type HolyricsConnection,
} from './holyricsClient.js';
import { HolyricsHostError } from './holyricsHost.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const localConn: HolyricsConnection = {
  mode: 'local',
  host: '127.0.0.1',
  port: 8091,
  token: 'secret-token-value',
  apiKey: '',
};

const internetConn: HolyricsConnection = {
  mode: 'internet',
  host: '127.0.0.1',
  port: 8091,
  token: 'secret-token-value',
  apiKey: 'internet-key',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('falha de rede local não inclui host, URL, token nem texto do fetch', async () => {
  globalThis.fetch = async () => {
    throw new Error(
      'fetch failed: http://127.0.0.1:8091/api/GetSongs?token=secret-token-value ECONNREFUSED'
    );
  };

  await assert.rejects(
    () => holyricsRequest(localConn, 'GetSongs'),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, HOLYRICS_LOCAL_UNREACHABLE);
      assert.doesNotMatch(error.message, /127\.0\.0\.1/);
      assert.doesNotMatch(error.message, /secret-token-value/);
      assert.doesNotMatch(error.message, /ECONNREFUSED/);
      return true;
    }
  );
});

test('falha na API internet também fica genérica', async () => {
  globalThis.fetch = async () => {
    throw new Error('getaddrinfo ENOTFOUND api.holyrics.com.br');
  };

  await assert.rejects(
    () => holyricsRequest(internetConn, 'GetSongs'),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, HOLYRICS_INTERNET_UNREACHABLE);
      assert.doesNotMatch(error.message, /holyrics\.com/);
      assert.doesNotMatch(error.message, /ENOTFOUND/);
      return true;
    }
  );
});

test('corpo de erro do Holyrics não vai para o cliente', async () => {
  globalThis.fetch = async () =>
    jsonResponse({ status: 'error', error: 'internal path /etc/passwd' }, 500);

  await assert.rejects(
    () => holyricsRequest(localConn, 'GetSongs'),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, HOLYRICS_REJECTED);
      assert.doesNotMatch(error.message, /passwd/);
      return true;
    }
  );
});

test('HTML inválido não vaza no erro público', async () => {
  globalThis.fetch = async () => new Response('<html>nginx 502 gateway</html>', { status: 200 });

  await assert.rejects(
    () => holyricsRequest(localConn, 'GetSongs'),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, HOLYRICS_INVALID_RESPONSE);
      assert.doesNotMatch(error.message, /nginx/);
      return true;
    }
  );
});

test('holyricsPublicError só deixa passar mensagens já sanitizadas', () => {
  assert.equal(
    holyricsPublicError(new Error('ECONNREFUSED 169.254.169.254')),
    HOLYRICS_GENERIC_FAILURE
  );
  assert.equal(holyricsPublicError(new Error(HOLYRICS_REJECTED)), HOLYRICS_REJECTED);
  assert.equal(
    holyricsPublicError(new HolyricsHostError('Informe o IP ou o nome do computador do Holyrics')),
    'Informe o IP ou o nome do computador do Holyrics'
  );
});
