import test from 'node:test';
import assert from 'node:assert/strict';
import { placeValueLabels } from '../lib/chartLayout.ts';

test('all labels remain visible with unchanged x coordinates, even for coincident entries', () => {
  const input = [
    { id: 'a', x: 60, y: -12, text: '3,5' },
    { id: 'b', x: 60, y: -12, text: '4' },
    { id: 'c', x: 66, y: -26, text: '11,2' },
    { id: 'd', x: 150, y: -12, text: '38' },
  ];
  const labels = placeValueLabels(input);
  assert.equal(labels.length, input.length);
  for (const item of input) {
    const label = labels.find(p => p.id === item.id);
    assert.equal(label.x, item.x);
    assert.ok(label.y <= item.y);
  }
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i], b = labels[j];
      assert.ok(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 + 3 || Math.abs(a.y - b.y) >= 14);
    }
  }
});

test('isolated labels stay next to their values, while empty data has no labels', () => {
  assert.deepEqual(placeValueLabels([]), []);
  const labels = placeValueLabels([{ id: 'a', x: 20, y: 50, text: '6,5' }, { id: 'b', x: 100, y: 50, text: '7' }]);
  assert.ok(labels.every(p => p.y === 50));
});
