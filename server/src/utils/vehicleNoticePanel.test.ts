import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  activeNoticesLabel,
  describeVehiclePanelChanges,
  sanitizePanelInstruction,
  serializeVehiclePanelNotice,
  sliceVehiclePanelPage,
  vehiclePanelInstruction,
  vehiclePanelLayoutMode,
  vehiclePanelPageCount,
} from './vehicleNoticePanel.js';

describe('painel de TV — avisos de veículos', () => {
  test('layout se adapta à quantidade de avisos', () => {
    assert.equal(vehiclePanelLayoutMode(0), 'empty');
    assert.equal(vehiclePanelLayoutMode(1), 'single');
    assert.equal(vehiclePanelLayoutMode(2), 'pair');
    assert.equal(vehiclePanelLayoutMode(3), 'triple');
    assert.equal(vehiclePanelLayoutMode(4), 'quad');
    assert.equal(vehiclePanelLayoutMode(5), 'paged');
  });

  test('paginação automática começa após quatro avisos', () => {
    assert.equal(vehiclePanelPageCount(0), 1);
    assert.equal(vehiclePanelPageCount(4), 1);
    assert.equal(vehiclePanelPageCount(5), 2);
    assert.equal(vehiclePanelPageCount(8), 2);
    assert.equal(vehiclePanelPageCount(9), 3);

    const ids = ['a', 'b', 'c', 'd', 'e'];
    assert.deepEqual(sliceVehiclePanelPage(ids, 0), ['a', 'b', 'c', 'd']);
    assert.deepEqual(sliceVehiclePanelPage(ids, 1), ['e']);
  });

  test('quantidade usa singular e plural', () => {
    assert.equal(activeNoticesLabel(0), '0 avisos ativos');
    assert.equal(activeNoticesLabel(1), '1 aviso ativo');
    assert.equal(activeNoticesLabel(2), '2 avisos ativos');
  });

  test('orientação da TV não inclui HTML nem observação privada', () => {
    assert.equal(vehiclePanelInstruction('remove_vehicle', 'segredo'), 'POR FAVOR, RETIRE O VEÍCULO');
    assert.equal(vehiclePanelInstruction('turn_off_lights'), 'FARÓIS ACESOS');
    assert.equal(vehiclePanelInstruction('close_door_or_window'), 'FECHE A PORTA OU JANELA');
    assert.equal(vehiclePanelInstruction('reposition_vehicle'), 'REPOSICIONE O VEÍCULO');
    assert.equal(
      vehiclePanelInstruction('other', '<script>alert(1)</script>Farol ligado'),
      'FAROL LIGADO'
    );
    assert.equal(sanitizePanelInstruction('<b>texto</b>  extra  '), 'texto extra');
  });

  test('serialização pública omite detalhes internos', () => {
    const payload = serializeVehiclePanelNotice({
      _id: 'abc',
      plate: 'ABC-1D23',
      vehicleModel: 'Gol branco',
      requestedAction: 'remove_vehicle',
      otherDescription: 'não deve aparecer nesta ação',
    });
    assert.deepEqual(Object.keys(payload).sort(), [
      'id',
      'instruction',
      'plate',
      'requestedAction',
      'vehicleModel',
    ]);
    assert.equal(payload.instruction, 'POR FAVOR, RETIRE O VEÍCULO');
    assert.equal('details' in payload, false);
  });

  test('data do painel é calculada em português brasileiro', () => {
    const date = new Date(2026, 8, 7, 12, 0, 0);
    const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' });
    const dayMonth = date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
    assert.match(weekday, /segunda/i);
    assert.match(dayMonth, /7/i);
    assert.match(dayMonth, /setembro/i);
  });

  test('anuncia entrada de novo aviso e ignora aviso resolvido removido', () => {
    const current = [
      { id: '2', plate: 'DEF-4567' },
      { id: '1', plate: 'ABC-1D23' },
    ];
    assert.equal(describeVehiclePanelChanges(null, current), '');
    assert.equal(
      describeVehiclePanelChanges(['1'], current),
      'Novo aviso: DEF-4567'
    );
    assert.equal(
      describeVehiclePanelChanges(['1', '2', '3'], [{ id: '1', plate: 'ABC-1D23' }]),
      ''
    );
    assert.equal(
      describeVehiclePanelChanges(['1'], [
        { id: '2', plate: 'AAA-0001' },
        { id: '3', plate: 'BBB-0002' },
      ]),
      '2 novos avisos de veículos'
    );
  });
});
