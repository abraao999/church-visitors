import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildCsv, buildSummaryPdf, protectCsvCell } from './reportExport.js';

describe('exportação de relatórios', () => {
  test('CSV protege células que começam com fórmula', () => {
    assert.equal(protectCsvCell('=CMD()'), "'=CMD()");
    assert.equal(protectCsvCell('+1+1'), "'+1+1");
    assert.equal(protectCsvCell('-2'), "'-2");
    assert.equal(protectCsvCell('@SUM(A1)'), "'@SUM(A1)");
    assert.match(buildCsv(['Nome'], [['=1+1']]).toString('utf8'), /'=1\+1/);
  });

  test('PDF resumido não inclui dados pessoais nem texto de oração', () => {
    const pdf = buildSummaryPdf({
      churchName: 'Igreja Esperanca',
      primaryColor: '#123456',
      periodLabel: '2026-09-01 a 2026-09-09',
      generatedAt: '09/09/2026 19:00',
      lines: ['Visitantes: 12', 'Pedidos de oracao: 4'],
    }).toString('latin1');
    assert.match(pdf, /Igreja Esperanca/);
    assert.match(pdf, /nao inclui nomes/);
    assert.equal(pdf.includes('11999999999'), false);
    assert.equal(pdf.includes('Ore pela minha familia'), false);
    assert.equal(pdf.includes('Maria Silva'), false);
  });
});
