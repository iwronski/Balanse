import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, mergeBackup, MAX_BACKUP_BYTES } from '../lib/backup.ts';
import { persistSnapshot, SNAPSHOT_KEY, LEGACY_KEYS } from '../lib/persistence.ts';
import { cleanOldBackupShares, shareBackupFile, SHARE_RETENTION_MS } from '../lib/backup-sharing.ts';

const stamp = '2026-10-17T12:30:00.000Z';
const meal = {
  id: 'meal-one', title: 'Brød', timestamp: stamp, ingredients: [
    { id: 'i1', name: 'Brød', grams: 50, carbsPer100g: 40, assumption: 'Anslag' },
  ], notes: 'Test', corrections: ['Endret porsjon'], source: 'manual', consumed: false,
  uncertainty: 'Usikkert', warnings: ['Estimat'], detectedWeightGrams: 55, confirmedWeightGrams: 50,
  photoUri: 'file:///local-photo.jpg', createdAt: stamp, updatedAt: stamp,
};
const data = () => ({
  meals: [structuredClone(meal)],
  health: ['glucose', 'insulin', 'exercise'].map((type, i) => ({
    id: `health-${i}`, type, timestamp: stamp, value: i + 1, note: 'Test',
    ...(type === 'insulin' ? { insulinKind: 'hurtig' } : {}),
    ...(type === 'exercise' ? { intensity: 'lett' } : {}),
  })),
  settings: { advanced: false, aiConsent: true, clinicianRatio: null, ratioNote: 'Behold', ratioSeeded: true },
});
const backup = () => parseBackup(buildBackup(data()));

test('roundtrip includes all fields and health even with advanced mode off', () => {
  const restored = backup();
  const { format, version, exportedAt, ...actual } = restored;
  assert.deepEqual(actual, data());
  assert.equal(format, 'karb-backup'); assert.equal(version, 1);
  assert.ok(Date.parse(exportedAt));
});
test('legacy optional fields and BOM are supported', () => {
  const source = data();
  delete source.meals[0].consumed; delete source.settings.ratioSeeded;
  assert.deepEqual(parseBackup('\uFEFF' + buildBackup(source)).meals, source.meals);
});
test('invalid, future, partial and duplicate-ID files are rejected without modifying current data', () => {
  const current = data(); const before = structuredClone(current);
  const mutations = [
    b => { b.version = 2; }, b => { delete b.health; },
    b => { b.meals[0].ingredients[0].grams = -1; },
    b => { b.meals[0].timestamp = 'not-a-date'; },
    b => { b.health[0].type = 'dose'; },
    b => { b.settings.advanced = 'true'; },
    b => { b.settings.clinicianRatio = 0; },
    b => { b.meals.push(b.meals[0]); },
    b => { b.health.push(b.health[0]); },
    b => { b.meals[0].consumed = 'false'; },
    b => { b.health[0].value = null; },
  ];
  for (const mutate of mutations) {
    const bad = backup(); mutate(bad);
    assert.throws(() => parseBackup(JSON.stringify(bad)));
  }
  for (const raw of ['{', 'null', '[]', '{}', 'x'.repeat(MAX_BACKUP_BYTES + 1)]) assert.throws(() => parseBackup(raw));
  assert.deepEqual(current, before);
});
test('empty backup is a merge, never a reset', () => {
  const current = data();
  const result = mergeBackup(current, parseBackup(buildBackup({ ...data(), meals: [], health: [] })), false);
  assert.deepEqual(result.next, current); assert.equal(result.added, 0);
});
test('same-ID conflicts preserve both versions, duplicates skipped, repeated import idempotent', () => {
  const current = data(); const incoming = backup();
  incoming.meals[0].title = 'Endret brød';
  incoming.health[0].value = 7;
  const result = mergeBackup(current, incoming, false);
  assert.equal(result.conflicts, 2); assert.equal(result.skipped, 2);
  assert.deepEqual(result.next.meals.find(m => m.id === meal.id), meal);
  assert.equal(result.next.meals.find(m => m.id !== meal.id).title, 'Endret brød');
  const again = mergeBackup(result.next, incoming, false);
  assert.equal(again.added, 0); assert.equal(again.skipped, 4);
  assert.deepEqual(current, data());
});
test('key order does not cause false conflicts', () => {
  const incoming = backup();
  incoming.meals[0] = Object.fromEntries(Object.entries(incoming.meals[0]).reverse());
  assert.equal(mergeBackup(data(), incoming, false).added, 0);
});
test('distinct IDs with identical content are distinct registrations', () => {
  const incoming = backup(); incoming.meals[0].id = 'another-id';
  assert.equal(mergeBackup(data(), incoming, false).next.meals.length, 2);
});
test('conflict IDs cannot collide with other incoming IDs', () => {
  const incoming = backup(); incoming.meals[0].title = 'Endret';
  incoming.meals.push({ ...meal, id: 'import-meal-one-1' });
  const result = mergeBackup(data(), incoming, false);
  assert.equal(new Set(result.next.meals.map(m => m.id)).size, 3);
});
test('settings opt-in restores null ratio without reseeding or granting AI consent', () => {
  const current = data(); current.settings.aiConsent = false; current.settings.clinicianRatio = 10;
  const incoming = backup(); incoming.settings.advanced = true; delete incoming.settings.ratioSeeded;
  assert.deepEqual(mergeBackup(current, incoming, false).next.settings, current.settings);
  assert.deepEqual(mergeBackup(current, incoming, true).next.settings, {
    ...incoming.settings, aiConsent: false, ratioSeeded: true,
  });
});
test('failed single-key commit leaves legacy records and prior snapshot untouched', async () => {
  const memory = new Map(LEGACY_KEYS.map(k => [k, 'original']));
  memory.set(SNAPSHOT_KEY, JSON.stringify(data()));
  const before = new Map(memory);
  await assert.rejects(() => persistSnapshot({
    setItem: async () => { throw new Error('QuotaExceededError'); },
    multiRemove: async keys => keys.forEach(k => memory.delete(k)),
  }, { ...data(), meals: [] }));
  assert.deepEqual(memory, before);
});
test('snapshot commits all sections together and remains authoritative if cleanup fails', async () => {
  const memory = new Map();
  await persistSnapshot({
    setItem: async (k, v) => { memory.set(k, v); },
    multiRemove: async () => { throw new Error('cleanup'); },
  }, data());
  assert.deepEqual(JSON.parse(memory.get(SNAPSHOT_KEY)), data());
});

test('delayed share recipient can read and import JSON after the chooser resolves', async () => {
  const disk = new Map();
  const now = 1800000000000;
  const file = {
    uri: 'file:///cache/karb-backup-shares/test.json', lastModified: now,
    write: json => disk.set(file.uri, json), delete: () => disk.delete(file.uri),
  };
  let receivedUri;
  await shareBackupFile(file, buildBackup(data()), async uri => { receivedUri = uri; });
  // The chooser has returned, and another export triggers cleanup before the recipient reads.
  cleanOldBackupShares([file], now + 60000);
  const restored = parseBackup(disk.get(receivedUri));
  assert.deepEqual(restored.meals, data().meals);
  assert.deepEqual(restored.health, data().health);
  assert.equal(mergeBackup(data(), restored, false).added, 0);
  cleanOldBackupShares([file], now + SHARE_RETENTION_MS + 1);
  assert.equal(disk.has(receivedUri), false);
});

test('share rejection also retains the file; unknown-age cache entries are not deleted', async () => {
  let deleted = false;
  const file = { uri: 'file:///test.json', write: () => {}, lastModified: null, delete: () => { deleted = true; } };
  await assert.rejects(() => shareBackupFile(file, buildBackup(data()), async () => { throw new Error('chooser failed'); }));
  cleanOldBackupShares([file]);
  assert.equal(deleted, false);
});
