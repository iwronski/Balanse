import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shiftKey, daysBetween, earliestKey, summarizeDay, periodAverage, clampKey, todayTimeline } from '../lib/homeSummary.ts';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();
const meal = (iso, g, consumed) => ({ timestamp: iso, consumed, ingredients: [{ grams: g, carbsPer100g: 100 }] });
const ins = (iso, v, kind = 'hurtig') => ({ timestamp: iso, type: 'insulin', value: v, insulinKind: kind });

test('calendar shift across DST and months', () => {
  assert.equal(shiftKey('2026-03-29', -1), '2026-03-28');
  assert.equal(shiftKey('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
});

test('earliest ignores reference meals and non-rapid insulin', () => {
  const meals = [meal(at(2026, 1, 3), 10), meal(at(2026, 1, 1), 10, false)];
  const health = [ins(at(2026, 1, 2), 3, 'langtid'), ins(at(2026, 1, 4), 2)];
  assert.equal(earliestKey(meals, health, '2026-01-05'), '2026-01-03');
  assert.equal(earliestKey([], [], '2026-01-05'), '2026-01-05');
});

test('day summary counts only consumed meals and rapid insulin', () => {
  const s = summarizeDay([meal(at(2026, 1, 3), 40), meal(at(2026, 1, 3), 99, false)], [ins(at(2026, 1, 3), 4), ins(at(2026, 1, 3), 20, 'langtid')], '2026-01-03');
  assert.deepEqual(s, { key: '2026-01-03', carbs: 40, meals: 1, rapid: 4, rapidCount: 1 });
});

test('period average uses union of days, missing metric = 0', () => {
  const meals = [meal(at(2026, 1, 1), 60), meal(at(2026, 1, 2), 30), meal(at(2026, 1, 9), 500, false)];
  const health = [ins(at(2026, 1, 2), 6), ins(at(2026, 1, 3), 3), ins(at(2026, 1, 3), 10, 'langtid')];
  const a = periodAverage(meals, health, '2026-01-04');
  assert.equal(a.days, 3);
  assert.equal(a.carbs, 30);
  assert.equal(a.rapid, 3);
  assert.equal(a.carbDays, 2); assert.equal(a.rapidDays, 2);
  assert.equal(periodAverage([], [], '2026-01-04').days, 0);
});

test('clamp and timeline newest first incl. all insulin types', () => {
  assert.equal(clampKey('2026-02-01', '2026-01-01', '2026-01-10'), '2026-01-10');
  assert.equal(clampKey('2025-12-01', '2026-01-01', '2026-01-10'), '2026-01-01');
  const tl = todayTimeline([meal(at(2026, 1, 3, 8), 10), meal(at(2026, 1, 3, 9), 5, false)], [ins(at(2026, 1, 3, 10), 2, 'langtid'), ins(at(2026, 1, 2, 23), 1)], '2026-01-03');
  assert.deepEqual(tl.map((x) => x.kind), ['insulin', 'meal']);
});
