import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  firstPublicName,
  normalizePanelObservation,
  readShowObservationOnPanel,
  sanitizePanelText,
} from './panelText.js';

describe('texto público do painel', () => {
  test('remove HTML, controle e corta em 80 caracteres', () => {
    const value = sanitizePanelText(`<b>Primeira visita</b>${'\u0001'} extra ${'x'.repeat(100)}`, 80);
    assert.equal(value.includes('<b>'), false);
    assert.equal(value.startsWith('Primeira visita'), true);
    assert.ok(value.length <= 80);
  });

  test('observação pública começa desligada e só aceita true explícito', () => {
    assert.equal(readShowObservationOnPanel(undefined), false);
    assert.equal(readShowObservationOnPanel('true'), false);
    assert.equal(readShowObservationOnPanel(true), true);
    assert.equal(normalizePanelObservation('<i>Convidado</i>'), 'Convidado');
  });

  test('anônimo não deve usar o nome completo', () => {
    assert.equal(firstPublicName('Maria Aparecida da Silva'), 'Maria');
  });
});
