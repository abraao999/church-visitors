import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  guestAccessHasScope,
  parseGuestAccessTypes,
  resolveGuestAccessTypes,
} from './guestAccessTypes.js';

describe('permissões do acesso público', () => {
  test('token antigo com type único vira uma permissão', () => {
    assert.deepEqual(resolveGuestAccessTypes({ type: 'visitors:create' }), [
      'visitors:create',
    ]);
    assert.equal(guestAccessHasScope({ type: 'prayers:create' }, 'prayers:create'), true);
    assert.equal(
      guestAccessHasScope({ type: 'prayers:create' }, 'vehicle_notices:create'),
      false
    );
  });

  test('acesso unificado preserva as três permissões na ordem canônica', () => {
    assert.deepEqual(
      parseGuestAccessTypes(
        ['vehicle_notices:create', 'visitors:create', 'prayers:create', 'visitors:create'],
        'prayers:create'
      ),
      ['visitors:create', 'prayers:create', 'vehicle_notices:create']
    );
  });

  test('types vazio recai no type legado sem alterar o token', () => {
    assert.deepEqual(
      resolveGuestAccessTypes({ type: 'vehicle_notices:create', types: [] }),
      ['vehicle_notices:create']
    );
  });

  test('lista persistida prevalece sobre o type legado', () => {
    assert.deepEqual(
      resolveGuestAccessTypes({
        type: 'visitors:create',
        types: ['prayers:create'],
      }),
      ['prayers:create']
    );
  });

  test('valores inválidos são ignorados', () => {
    assert.deepEqual(parseGuestAccessTypes(['records:read', 'visitors:create']), [
      'visitors:create',
    ]);
    assert.deepEqual(parseGuestAccessTypes(null), []);
  });
});
