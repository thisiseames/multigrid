import test from 'node:test';
import assert from 'node:assert/strict';
import { DOCK_SIZE, dockData, dockItems, isPinned, noteOpen, pin, unpin } from '../src/dock.js';

const now = Date.parse('2026-11-23T20:00:00Z');
const day = 24 * 3600 * 1000;
const favs = Array.from({ length: 20 }, (_, i) => ({ name: `F${i}`, input: `https://example.com/${i}` }));
const at = (i) => favs[i].input;

test('a stored dock made safe', () => {
  assert.deepEqual(dockData(null), { pins: [], opens: {} });
  assert.deepEqual(dockData({ pins: ['a', 'a', 3, ''], opens: { a: [1, 'x'], b: [] } }), { pins: ['a'], opens: { a: [1] } });
});

test('order: pins first, then most opened in 30 days, then recent; only favorites; at most 12', () => {
  let data = dockData(null);
  data = pin(data, at(5));
  data = pin(data, at(5));
  data = pin(data, at(2));
  for (let i = 0; i < 3; i++) data = noteOpen(data, at(9), now - i * 1000);
  data = noteOpen(data, at(7), now);
  data = noteOpen(data, 'https://not-a-favorite.example', now);
  data = { ...data, opens: { ...data.opens, [at(11)]: [now - 40 * day, now - 41 * day, now - 42 * day, now - 43 * day] } };
  const items = dockItems(data, favs, [at(3), at(9), at(4)], now);
  assert.deepEqual(items.map((item) => item.name), ['F5', 'F2', 'F9', 'F7', 'F3', 'F4']);
  assert.equal(items[0].pinned, true);
  assert.equal(items[2].pinned, false);
  const full = dockItems(dockData(null), favs, favs.map((f) => f.input), now);
  assert.equal(full.length, DOCK_SIZE);
});

test('pin, unpin, and old opens dropped', () => {
  let data = pin(dockData(null), at(1));
  assert.equal(isPinned(data, at(1)), true);
  data = unpin(data, at(1));
  assert.equal(isPinned(data, at(1)), false);
  data = { ...data, opens: { [at(2)]: [now - 40 * day] } };
  data = noteOpen(data, at(3), now);
  assert.deepEqual(Object.keys(data.opens), [at(3)]);
});
