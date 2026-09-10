import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  canChangePrayerCareStatus,
  canGrantPermissions,
  clampPermissionsToGrant,
  hasPermission,
  permissionsForRole,
  resolvePermissions,
  sanitizePermissions,
} from './permissions.js';

describe('funções e permissões da equipe', () => {
  test('proprietário recebe o conjunto completo', () => {
    const owner = permissionsForRole('owner');
    assert.equal(hasPermission(owner, 'team:invite'), true);
    assert.equal(hasPermission(owner, 'follow_up:read'), true);
    assert.equal(hasPermission(owner, 'church:update'), true);
    assert.equal(hasPermission(owner, 'prayers:read'), true);
    assert.equal(hasPermission(owner, 'reports:read'), true);
    assert.equal(hasPermission(owner, 'reports:export_sensitive'), true);
  });

  test('portaria não lê pedidos privados', () => {
    const portaria = permissionsForRole('portaria');
    assert.equal(hasPermission(portaria, 'visitors:create'), true);
    assert.equal(hasPermission(portaria, 'follow_up:create'), true);
    assert.equal(hasPermission(portaria, 'follow_up:read'), false);
    assert.equal(hasPermission(permissionsForRole('admin'), 'follow_up:close'), true);
    assert.equal(hasPermission(portaria, 'church:update'), false);
  });

  test('intercessão lê oração e mídia não altera a igreja', () => {
    assert.equal(hasPermission(permissionsForRole('intercession'), 'prayers:read'), true);
    assert.equal(hasPermission(permissionsForRole('intercession'), 'follow_up:read'), true);
    assert.equal(hasPermission(permissionsForRole('intercession'), 'follow_up:contact'), true);
    assert.equal(hasPermission(permissionsForRole('intercession'), 'follow_up:reassign'), true);
    assert.equal(hasPermission(permissionsForRole('intercession'), 'follow_up:create'), false);
    assert.equal(hasPermission(permissionsForRole('intercession'), 'visitors:read'), false);
    assert.equal(hasPermission(permissionsForRole('midia'), 'panels:open'), true);
    assert.equal(hasPermission(permissionsForRole('midia'), 'church:update'), false);
    assert.equal(hasPermission(permissionsForRole('louvor'), 'holyrics:sync'), true);
    assert.equal(hasPermission(permissionsForRole('admin'), 'team:invite'), true);
    assert.equal(hasPermission(permissionsForRole('admin'), 'church:update'), true);
    assert.equal(hasPermission(permissionsForRole('admin'), 'holyrics:configure'), true);
    assert.equal(hasPermission(permissionsForRole('admin'), 'retention:manage'), true);
    assert.equal(hasPermission(permissionsForRole('admin'), 'reports:export'), true);
    assert.equal(hasPermission(permissionsForRole('portaria'), 'reports:read'), false);
    assert.equal(canChangePrayerCareStatus('intercession'), true);
    assert.equal(canChangePrayerCareStatus('admin'), true);
    assert.equal(canChangePrayerCareStatus('owner'), true);
    assert.equal(canChangePrayerCareStatus('portaria'), false);
    assert.equal(canChangePrayerCareStatus('louvor'), false);
  });

  test('portaria gerencia aparelhos e cultos de consulta, mídia não', () => {
    const portaria = permissionsForRole('portaria');
    assert.equal(hasPermission(portaria, 'portaria_devices:create'), true);
    assert.equal(hasPermission(portaria, 'services:read'), true);
    assert.equal(hasPermission(portaria, 'vehicle_notices:archive'), true);
    assert.equal(hasPermission(permissionsForRole('midia'), 'portaria_devices:read'), false);
    assert.equal(hasPermission(permissionsForRole('intercession'), 'prayers:project'), true);
    assert.equal(hasPermission(permissionsForRole('intercession'), 'panels:open'), false);
  });

  test('permissões personalizadas são limitadas às do concedente', () => {
    const requested = sanitizePermissions(['visitors:read', 'church:update', 'unknown']);
    const granted = clampPermissionsToGrant(requested, permissionsForRole('portaria'));
    assert.equal(granted.includes('visitors:read'), true);
    assert.equal(granted.includes('church:update'), false);
    assert.equal(canGrantPermissions(permissionsForRole('portaria'), ['prayers:read']), false);
  });

  test('função owner ignora customização incompleta', () => {
    assert.deepEqual(
      resolvePermissions({ role: 'owner', permissions: ['visitors:read'], permissionsCustomized: true }),
      permissionsForRole('owner')
    );
  });
});
