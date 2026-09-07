import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  parseVehicleAlertPrefs,
  vehicleAlertSeenKey,
  vehicleAlertStorageKey,
} from './vehicleAlertPrefs.ts';

describe('preferências de alerta de veículos', () => {
  test('preferências ficam separadas por igreja e por usuário', () => {
    assert.notEqual(
      vehicleAlertStorageKey('u1', 'AD Umuarama'),
      vehicleAlertStorageKey('u1', 'Igreja Norte')
    );
    assert.notEqual(
      vehicleAlertStorageKey('u1', 'AD Umuarama'),
      vehicleAlertStorageKey('u2', 'AD Umuarama')
    );
    assert.equal(
      vehicleAlertStorageKey('u1', 'AD Umuarama'),
      vehicleAlertStorageKey('u1', 'ad umuarama')
    );
    assert.notEqual(
      vehicleAlertSeenKey('u1', 'AD Umuarama'),
      vehicleAlertSeenKey('u1', 'Igreja Norte')
    );
  });

  test('placa na notificação do sistema começa desligada', () => {
    const prefs = parseVehicleAlertPrefs({ enabled: true });
    assert.equal(prefs.showPlateInBrowser, false);
    assert.equal(prefs.volume, 'medium');
    assert.equal(prefs.enabled, true);
  });
});
