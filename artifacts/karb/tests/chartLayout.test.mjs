import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glucoseBand, dayEnd, hourTicks, stackLanes, glucoseLabelTiers, glucoseRuns, requiredPlotWidth, HOUR } from '../lib/chartLayout.ts';

test('glucose band boundaries inclusive 3.9..10', () => {
  assert.equal(glucoseBand(3.89), 'low'); assert.equal(glucoseBand(3.3), 'low');
  assert.equal(glucoseBand(3.9), 'in'); assert.equal(glucoseBand(10), 'in');
  assert.equal(glucoseBand(10.1), 'high');
});

test('DST day lengths (Europe/Oslo)', () => {
  const spring = new Date(2026, 2, 29).getTime();
  const autumn = new Date(2026, 9, 25).getTime();
  assert.equal((dayEnd(spring) - spring) / HOUR, 23);
  assert.equal((dayEnd(autumn) - autumn) / HOUR, 25);
  const normal = new Date(2026, 5, 1).getTime();
  assert.equal((dayEnd(normal) - normal) / HOUR, 24);
  const ticks = hourTicks(spring, dayEnd(spring));
  assert.equal(new Set(ticks.map((t) => t.t)).size, ticks.length);
  assert.equal(ticks.at(-1).label, '24');
  assert.ok(!ticks.some((t) => t.label === '02'));
});

test('same-time events stack in distinct lanes at true x', () => {
  const t = 1000;
  const p = stackLanes([{ id: 'a', t }, { id: 'b', t }, { id: 'c', t: t + 1 }, { id: 'd', t: 9000 }], (v) => v / 10, 40);
  assert.deepEqual(p.map((q) => q.lane), [0, 1, 2, 0]);
  assert.deepEqual(p.map((q) => q.x), [100, 100, 100.1, 900]);
});

test('glucose labels centered at true x, lows always labelled', () => {
  const items = [{ id: 'a', t: 0, value: 6 }, { id: 'b', t: 1, value: 3.3 }, { id: 'c', t: 2, value: 7 }, { id: 'd', t: 3, value: 8 }, { id: 'e', t: 4, value: 3.1 }];
  const l = glucoseLabelTiers(items, (t) => 100 + t, 30, 2);
  assert.ok(l.every((q) => q.x === 100 + q.item.t));
  const low = l.filter((q) => q.item.value < 3.9);
  assert.ok(low.every((q) => q.tier !== null));
  assert.notEqual(low[0].tier, low[1].tier);
  assert.ok(l.some((q) => q.tier === null));
});

test('sparse fits, dense scrolls modestly', () => {
  const s = new Date(2026, 5, 1).getTime();
  assert.equal(requiredPlotWidth([[s, s, s]], s, dayEnd(s), 0, 300), 300);
  const cgm = Array.from({ length: 288 }, (_, i) => s + i * 300000);
  assert.equal(requiredPlotWidth([cgm], s, dayEnd(s), 0, 300), 750);
});

test('glucose runs break over gaps', () => {
  const r = glucoseRuns([{ t: 0 }, { t: 5 * 60000 }, { t: 60 * 60000 }]);
  assert.equal(r.length, 2);
});
