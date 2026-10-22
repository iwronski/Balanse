import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftError, draftNumber, draftRecords, fromParsed, newDraft } from '../lib/entryDraft.ts';
import { mergeEntryRecords } from '../lib/entryRecords.ts';
import { persistSnapshot, SNAPSHOT_KEY } from '../lib/persistence.ts';

const at = '2026-10-19T12:00:00+02:00';
const parsed = (type, changes = {}) => fromParsed({ type, timestamp: at, title: type === 'meal' ? '' : 'Test', note: '', ...changes });

test('missing health values stay blank and cannot be saved; zero carbohydrate is valid', () => {
  const insulin = parsed('insulin', { value: null, insulinKind: null });
  assert.equal(insulin.value, '');
  assert.ok(draftError(insulin));
  insulin.value = '4,5';
  assert.match(draftError(insulin), /insulintype/);
  insulin.insulinKind = 'hurtig';
  assert.equal(draftError(insulin), null);
  const food = parsed('meal', { ingredients: [{ name: 'Kylling', grams: 100, carbsPer100g: 0, assumption: '' }] });
  assert.equal(draftError(food), null);
  assert.equal(draftRecords([food], at).meals[0].title, 'Kylling');
});

test('food amount, glucose and partial invalid numbers are not silently accepted', () => {
  for (const value of ['', '-2', '4abc', 'NaN', 'Infinity', '1.2.3', '1,2,3', '4e2']) assert.ok(Number.isNaN(draftNumber(value)));
  assert.equal(draftNumber('4,5'), 4.5);
  const glucose = parsed('glucose', { value: 41 });
  assert.ok(draftError(glucose));
  const food = parsed('meal', { ingredients: [{ name: 'Ris', grams: null, carbsPer100g: 28, assumption: '' }] });
  assert.ok(draftError(food));
  assert.throws(() => draftRecords([food], at));
});

test('a mixed draft keeps exact amounts and IDs and only type-relevant fields', () => {
  const ds = [
    parsed('meal', { ingredients: [{ name: 'Ris', grams: 150, carbsPer100g: 28, assumption: 'Kokt' }] }),
    parsed('insulin', { value: 4.5, insulinKind: 'hurtig' }),
    parsed('glucose', { value: 6.2 }),
    parsed('exercise', { value: 30, intensity: 'lett', note: 'Gåtur' }),
  ];
  const result = draftRecords(ds, at);
  assert.equal(result.meals.length, 1);
  assert.equal(result.health.length, 3);
  assert.equal(result.health[0].value, 4.5);
  assert.equal(result.health[0].insulinKind, 'hurtig');
  assert.equal(result.health[2].type, 'exercise');
  assert.equal(result.health[2].note, 'Gåtur');
  assert.equal('insulinKind' in result.health[1], false);
  assert.deepEqual([...result.meals, ...result.health].map(x => x.id), ds.map(d => d.id));
  assert.deepEqual(draftRecords(ds, at), result);
});

test('mixed upsert preserves existing data, remains idempotent, and makes a single durable commit', async () => {
  const old = { meals: [{ id: 'oldmeal', timestamp: '2026-10-18T12:00:00Z', ingredients: [], consumed: false }],
    health: [{ id: 'oldhealth', timestamp: '2026-10-18T12:00:00Z', type: 'insulin', value: 20, insulinKind: 'langtid', note: '' }],
    settings: { advanced: false, aiConsent: false } };
  const before = JSON.stringify(old);
  const result = draftRecords([parsed('insulin', { value: 4, insulinKind: 'hurtig' }), parsed('meal', {
    ingredients: [{ name: 'Brød', grams: 80, carbsPer100g: 40, assumption: '' }],
  })], at);
  const next = mergeEntryRecords(old, result.meals, result.health);
  assert.equal(JSON.stringify(old), before);
  assert.equal(next.meals.length, 2);
  assert.equal(next.health.length, 2);
  assert.equal(next.meals[1].consumed, false);
  assert.equal(next.settings, old.settings);
  assert.deepEqual(mergeEntryRecords(next, result.meals, result.health), next);
  const writes = [];
  await persistSnapshot({ setItem: async (k, v) => writes.push([k, JSON.parse(v)]), multiRemove: async () => {} }, next);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], SNAPSHOT_KEY);
  assert.deepEqual(writes[0][1], next);
  await assert.rejects(persistSnapshot({ setItem: async () => { throw new Error('full'); }, multiRemove: async () => {} }, next));
  assert.equal(JSON.stringify(old), before);
});

test('new manual drafts require data; activity intensity is optional', () => {
  const d = newDraft('exercise');
  assert.ok(draftError(d));
  d.value = '30';
  assert.equal(draftError(d), null);
  assert.ok(draftError(newDraft('meal')));
});
