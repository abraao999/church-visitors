import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HolyricsHostError, normalizeHolyricsHost } from './holyricsHost.js';

describe('endereço do Holyrics no modo local', () => {
  test('aceita IP e nome de máquina da rede da igreja', () => {
    assert.equal(normalizeHolyricsHost('127.0.0.1'), '127.0.0.1');
    assert.equal(normalizeHolyricsHost(' 192.168.0.15 '), '192.168.0.15');
    assert.equal(normalizeHolyricsHost('PC-Projecao'), 'pc-projecao');
    assert.equal(normalizeHolyricsHost('holyrics.local'), 'holyrics.local');
  });

  test('bloqueia endereços de metadados da hospedagem', () => {
    for (const host of [
      '169.254.169.254',
      '169.254.170.2',
      '169.254.1.1',
      '100.100.100.200',
      'metadata.google.internal',
      'instance-data',
    ]) {
      assert.throws(() => normalizeHolyricsHost(host), HolyricsHostError, host);
    }
  });

  test('rejeita tentativa de montar outra URL', () => {
    for (const host of [
      'http://169.254.169.254',
      '127.0.0.1/latest/meta-data',
      '127.0.0.1:8091',
      'usuario@169.254.169.254',
      '127.0.0.1?x=1',
      '127.0.0.1 169.254.169.254',
      'fd00:ec2::254',
      '-inicio-invalido',
    ]) {
      assert.throws(() => normalizeHolyricsHost(host), HolyricsHostError, host);
    }
  });

  test('endereço vazio pede preenchimento', () => {
    assert.throws(() => normalizeHolyricsHost(''), /Informe o IP/);
    assert.throws(() => normalizeHolyricsHost(undefined), /Informe o IP/);
  });
});
