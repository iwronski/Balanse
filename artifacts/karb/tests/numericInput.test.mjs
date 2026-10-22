import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustQuantity, parseDecimal } from '../lib/numericInput.ts';

test('quantity buttons add the displayed step without snapping or losing precision', () => {
  assert.equal(adjustQuantity('7,4', 0.5, 1), '7,9');
  assert.equal(adjustQuantity('3,25', 0.5, 1), '3,75');
  assert.equal(adjustQuantity('83', 10, 1, 0, 0), '93');
  assert.equal(adjustQuantity('7,4', 0.1, 1), '7,5');
  assert.equal(adjustQuantity('7.5', 0.1, -1), '7,4');
});
test('empty quantities start with one step, negative results clamp at zero', () => {
  assert.equal(adjustQuantity('', 0.5, 1), '0,5');
  assert.equal(adjustQuantity('0,2', 0.5, -1), '0');
  assert.equal(adjustQuantity('0', 10, -1), '0');
  assert.equal(parseDecimal('8,5'), 8.5);
  assert.equal(parseDecimal('8.5'), 8.5);
  assert.ok(Number.isNaN(parseDecimal('3,2,1')));
});
