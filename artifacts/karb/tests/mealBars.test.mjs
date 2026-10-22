import test from 'node:test';
import assert from 'node:assert/strict';
import { mealBars } from '../lib/chartLayout.ts';

test('all meal columns meet the same x-axis and retain proportional heights', () => {
  const input = [{ id: 'a', t: 10, value: 30 }, { id: 'b', t: 11, value: 60 }, { id: 'c', t: 80, value: 0 }];
  const bars = mealBars(input, t => t * 2, 240, 60, 60);
  for (const bar of bars) assert.equal(bar.y + bar.height, 240);
  assert.equal(bars[0].height, 30);
  assert.equal(bars[1].height, 60);
  assert.equal(bars[2].height, 0);
  assert.ok(bars[0].x + bars[0].width / 2 < bars[1].x - bars[1].width / 2);
  assert.deepEqual(input.map(p => p.value), [30, 60, 0]);
});

test('simultaneous meals sit side by side, centered on their shared timestamp', () => {
  const bars = mealBars([{ id: 'a', t: 50, value: 20 }, { id: 'b', t: 50, value: 40 }], t => t, 100, 60, 60);
  assert.equal((bars[0].x + bars[1].x) / 2, 50);
  assert.ok(bars[0].x + bars[0].width / 2 < bars[1].x - bars[1].width / 2);
  assert.equal(bars[0].y + bars[0].height, bars[1].y + bars[1].height);
});
