import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mealTitle } from '../lib/types.ts';

test('generic or blank meal title uses first ingredient without mutating saved data', () => {
  const m = { title: 'Mitt måltid', ingredients: [{ name: 'Ris' }, { name: 'Kylling' }] };
  assert.equal(mealTitle(m), 'Ris');
  assert.equal(m.title, 'Mitt måltid');
  assert.equal(mealTitle({ ...m, title: '' }), 'Ris');
  assert.equal(mealTitle({ ...m, title: 'Min middag' }), 'Min middag');
  assert.equal(mealTitle({ title: '', ingredients: [] }), 'Måltid');
});
