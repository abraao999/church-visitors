import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DEFAULT_VEHICLE_ALERT_PREFS, VEHICLE_ALERT_VOLUMES } from './vehicleAlertConstants.ts';
import { claimVehicleAlertIds, parseVehicleAlertSeen } from './vehicleAlertDedup.ts';
import {
  alertsAreActive,
  backoffDelay,
  browserNotificationBody,
  canReceiveVehicleAlerts,
  formatPendingBadge,
  pendingBadgeLabel,
  shouldNotifyStatus,
} from './vehicleAlertLogic.ts';

describe('lógica dos alertas de veículos', () => {
  test('primeiro carregamento não trata avisos já vistos como novos', () => {
    const seen = parseVehicleAlertSeen({
      cursor: 'cursor-1',
      ids: { old: Date.now() + 60_000 },
    });
    const { claimed } = claimVehicleAlertIds(seen, ['old', 'new']);
    assert.deepEqual(claimed, ['new']);
  });

  test('atualização de um aviso já visto não gera novo alerta', () => {
    const seen = parseVehicleAlertSeen({
      ids: { same: Date.now() + 60_000 },
    });
    const { claimed } = claimVehicleAlertIds(seen, ['same']);
    assert.deepEqual(claimed, []);
  });

  test('reconexão não reclama IDs já notificados', () => {
    const first = claimVehicleAlertIds(parseVehicleAlertSeen(null), ['a', 'b']);
    const second = claimVehicleAlertIds(first.next, ['a', 'b']);
    assert.deepEqual(first.claimed, ['a', 'b']);
    assert.deepEqual(second.claimed, []);
  });

  test('duas abas não tocam o mesmo aviso', () => {
    const shared = parseVehicleAlertSeen(null);
    const tabA = claimVehicleAlertIds(shared, ['n1']);
    const tabB = claimVehicleAlertIds(tabA.next, ['n1']);
    assert.deepEqual(tabA.claimed, ['n1']);
    assert.deepEqual(tabB.claimed, []);
  });

  test('badge mostra quantidade e 9+', () => {
    assert.equal(formatPendingBadge(0), '');
    assert.equal(formatPendingBadge(1), '1');
    assert.equal(formatPendingBadge(9), '9');
    assert.equal(formatPendingBadge(10), '9+');
    assert.equal(pendingBadgeLabel(2), '2 avisos de veículos pendentes');
    assert.equal(pendingBadgeLabel(12), '9+ avisos de veículos pendentes');
  });

  test('usuário sem permissão não recebe alertas', () => {
    assert.equal(canReceiveVehicleAlerts(['prayers:read']), false);
    assert.equal(canReceiveVehicleAlerts(['vehicle_notices:read']), true);
  });

  test('volumes nunca usam o máximo do sistema', () => {
    assert.ok(DEFAULT_VEHICLE_ALERT_PREFS.volume === 'medium');
    assert.ok(VEHICLE_ALERT_VOLUMES.low < VEHICLE_ALERT_VOLUMES.medium);
    assert.ok(VEHICLE_ALERT_VOLUMES.medium < VEHICLE_ALERT_VOLUMES.high);
    assert.ok(VEHICLE_ALERT_VOLUMES.high < 0.4);
  });

  test('somente pending gera alerta', () => {
    assert.equal(shouldNotifyStatus('pending'), true);
    assert.equal(shouldNotifyStatus('announced'), false);
    assert.equal(shouldNotifyStatus('resolved'), false);
  });

  test('restrição ao período do culto consulta o estado do servidor', () => {
    const prefs = { ...DEFAULT_VEHICLE_ALERT_PREFS, enabled: true, when: 'service' as const };
    assert.equal(alertsAreActive(prefs, false), false);
    assert.equal(alertsAreActive(prefs, true), true);
    assert.equal(alertsAreActive({ ...prefs, when: 'always' }, false), true);
    assert.equal(alertsAreActive({ ...prefs, enabled: false }, true), false);
  });

  test('notificação do navegador oculta a placa por padrão', () => {
    const hidden = browserNotificationBody(
      { ...DEFAULT_VEHICLE_ALERT_PREFS, showPlateInBrowser: false },
      { plate: 'ABC-1D23' }
    );
    assert.equal(hidden.title, 'Novo aviso de veículo recebido.');
    assert.equal(hidden.body.includes('ABC-1D23'), false);
    const shown = browserNotificationBody(
      { ...DEFAULT_VEHICLE_ALERT_PREFS, showPlateInBrowser: true },
      { plate: 'ABC-1D23' }
    );
    assert.equal(shown.body.includes('ABC-1D23'), true);
  });

  test('falha persistente aumenta o intervalo sem cair em 1 segundo', () => {
    assert.equal(backoffDelay(0, true, 10_000, 45_000), 10_000);
    assert.equal(backoffDelay(2, true, 10_000, 45_000), 40_000);
    assert.ok(backoffDelay(6, false, 10_000, 45_000) >= 45_000);
    assert.ok(backoffDelay(6, true, 10_000, 45_000) <= 60_000);
  });
});
