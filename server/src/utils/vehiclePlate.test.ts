import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatVehiclePlate,
  maskVehiclePlateInput,
  normalizePlateInput,
  parseVehiclePlate,
} from './vehiclePlate.js';

test('aceita placas antigas e Mercosul com formatação', () => {
  assert.deepEqual(parseVehiclePlate('abc1234'), {
    plateNormalized: 'ABC1234',
    plate: 'ABC-1234',
  });
  assert.deepEqual(parseVehiclePlate('abc-1d23'), {
    plateNormalized: 'ABC1D23',
    plate: 'ABC-1D23',
  });
  assert.deepEqual(parseVehiclePlate('  abc 1d23  '), {
    plateNormalized: 'ABC1D23',
    plate: 'ABC-1D23',
  });
});

test('rejeita placas inválidas', () => {
  assert.equal(parseVehiclePlate(''), null);
  assert.equal(parseVehiclePlate('AB1234'), null);
  assert.equal(parseVehiclePlate('ABCD123'), null);
  assert.equal(parseVehiclePlate('ABC12D3'), null);
  assert.equal(parseVehiclePlate('123-ABCD'), null);
  assert.equal(parseVehiclePlate('ABC-12'), null);
});

test('máscara e normalização removem caracteres inválidos', () => {
  assert.equal(normalizePlateInput('ab@c-1d#23'), 'ABC1D23');
  assert.equal(maskVehiclePlateInput('abc1'), 'ABC-1');
  assert.equal(maskVehiclePlateInput('abc1d23'), 'ABC-1D23');
  assert.equal(formatVehiclePlate('ABC1234'), 'ABC-1234');
});
