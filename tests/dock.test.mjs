import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCK_SIZE, addToDock, canPinToDock, dockData, dockItems, freeDockSlots, isAdded, isPinned,
  movePin, noteOpen, pin, removeFromDock, reorderPin, unpin,
} from '../src/dock.js';

const now = Date.parse('2026-11-23T20:00:00Z');
const day = 24 * 3600 * 1000;
const favs = Array.from({ length: 20 }, (_, i) => ({ name: `F${i}`, input: `https://example.com/${i}` }));
const at = (i) => favs[i].input;

test('a stored dock made safe', () => {
  assert.deepEqual(dockData(null), { pins: [], opens: {}, added: [], hidden: [] });
  assert.deepEqual(dockData({ pins: ['a', 'a', 3, ''], opens: { a: [1, 'x'], b: [] } }), { pins: ['a'], opens: { a: [1] }, added: [], hidden: [] });
  assert.deepEqual(dockData({ hidden: ['a', 'a', 3] }).hidden, ['a']);
  assert.deepEqual(
    dockData({ added: [{ input: 'x', name: ' X ' }, { input: 'x', name: 'dup' }, 'y', { input: 'local:a' }] }).added,
    [{ input: 'x', name: 'X' }, { input: 'y', name: 'y' }],
  );
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
  assert.deepEqual(items.slice(0, 6).map((item) => item.name), ['F5', 'F2', 'F9', 'F7', 'F3', 'F4']);
  assert.deepEqual(items.slice(6, 9).map((item) => item.name), ['F0', 'F1', 'F6']);
  assert.equal(items.length, DOCK_SIZE);
  assert.equal(items[0].pinned, true);
  assert.equal(items[2].pinned, false);
  const full = dockItems(dockData(null), favs, favs.map((f) => f.input), now);
  assert.equal(full.length, DOCK_SIZE);
});

test('manual additions come after pins and before the automatic picks', () => {
  let data = dockData(null);
  data = pin(data, at(5));
  data = addToDock(data, 'https://manual.example', 'Manual Stream');
  data = addToDock(data, at(2), 'F2');
  data = noteOpen(data, at(9), now);
  const items = dockItems(data, favs, [at(3)], now);
  assert.deepEqual(items.slice(0, 5).map((item) => item.name), ['F5', 'Manual Stream', 'F2', 'F9', 'F3']);
  assert.equal(items[1].input, 'https://manual.example');
  assert.equal(items[1].added, true);
  assert.equal(items[1].pinned, false);
  assert.equal(items[2].added, true);
});

test('pins and manual additions share the 12 slots', () => {
  let data = dockData(null);
  for (let i = 0; i < DOCK_SIZE; i++) data = pin(data, at(i));
  assert.equal(freeDockSlots(data), 0);
  assert.equal(canPinToDock(data, at(0)), true);
  assert.equal(canPinToDock(data, 'https://new.example'), false);
  assert.equal(addToDock(data, 'https://new.example', 'New'), data);

  let partial = dockData(null);
  for (let i = 0; i < DOCK_SIZE - 1; i++) partial = pin(partial, at(i));
  assert.equal(freeDockSlots(partial), 1);
  partial = addToDock(partial, 'https://manual.example', 'Manual');
  assert.equal(freeDockSlots(partial), 0);
  assert.equal(canPinToDock(partial, 'https://manual.example'), true);
  assert.equal(addToDock(partial, 'https://another.example', 'Another'), partial);
});

test('remove and reorder pins and manual additions', () => {
  let data = dockData(null);
  data = pin(data, at(0));
  data = pin(data, at(1));
  data = pin(data, at(2));
  data = addToDock(data, 'https://manual.example', 'Manual');
  assert.equal(isAdded(data, 'https://manual.example'), true);
  assert.deepEqual(movePin(data, at(2), -1).pins, [at(0), at(2), at(1)]);
  assert.deepEqual(reorderPin(data, at(0), at(2), false).pins, [at(1), at(0), at(2)]);
  assert.deepEqual(reorderPin(data, at(0), at(2), true).pins, [at(1), at(2), at(0)]);
  assert.deepEqual(removeFromDock(data, 'https://manual.example').added, []);
  assert.equal(isPinned(removeFromDock(data, at(0)), at(0)), false);
});

test('removing hides automatic items and adding brings them back', () => {
  let data = removeFromDock(dockData(null), at(0));
  assert.deepEqual(data.hidden, [at(0)]);
  assert.equal(dockItems(data, favs, [at(0)], now).some((item) => item.input === at(0)), false);
  data = addToDock(data, at(0), 'F0');
  assert.deepEqual(data.hidden, []);
  assert.deepEqual(data.added, [{ input: at(0), name: 'F0' }]);
  assert.equal(dockItems(data, favs, [at(0)], now).some((item) => item.input === at(0)), true);
  assert.equal(pin(data, at(1)).hidden.includes(at(1)), false);
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
