import test from 'node:test';
import assert from 'node:assert/strict';
import { otherLiveChannels, readChannelOverlay, writeChannelOverlay } from '../src/channel-overlay.js';

const now = Date.parse('2026-11-26T21:00:00Z');
const show = (title, start, end) => ({ title, start, end, about: '' });
const row = (name, input, current = null) => ({ item: { name, input }, listing: { current } });

test('the channel overlay is on by default and remembers off', () => {
  const storage = {
    value: null,
    getItem() { return this.value; },
    setItem(_key, value) { this.value = value; },
  };
  assert.equal(readChannelOverlay(storage), true);
  assert.equal(writeChannelOverlay(false, storage), false);
  assert.equal(readChannelOverlay(storage), false);
  assert.equal(writeChannelOverlay(true, storage), true);
  assert.equal(readChannelOverlay(storage), true);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readChannelOverlay(broken), true);
  assert.equal(writeChannelOverlay(true, broken), true);
});

test('other live channels keep guide order and drop the current channel', () => {
  const live = show('NFL Football', now - 60 * 60000, now + 60 * 60000);
  const rows = [
    row('TSN1', 'tsn1', live),
    row('TSN2', 'tsn2', show('Hockey', now - 30 * 60000, now + 30 * 60000)),
    row('TSN 1', 'tsn1-copy', live),
    row('TSN3', 'tsn3', show('Later', now + 60000, now + 2 * 60000)),
    row('TSN4', 'tsn4', null),
    row('TSN5', 'tsn5', show('Basketball', now - 10000, now + 10000)),
  ];
  assert.deepEqual(otherLiveChannels(rows, 'TSN1', now), [
    { name: 'TSN2', input: 'tsn2', title: 'Hockey' },
    { name: 'TSN5', input: 'tsn5', title: 'Basketball' },
  ]);
  assert.deepEqual(otherLiveChannels(rows, 'TSN1', now, 'tsn2'), [
    { name: 'TSN5', input: 'tsn5', title: 'Basketball' },
  ]);
  assert.deepEqual(otherLiveChannels(rows, 'TSN2', now), [
    { name: 'TSN1', input: 'tsn1', title: 'NFL Football' },
    { name: 'TSN5', input: 'tsn5', title: 'Basketball' },
  ]);
  assert.deepEqual(otherLiveChannels([], 'TSN1', now), []);
  assert.deepEqual(otherLiveChannels(rows, 'TSN1', now + 31 * 60000), []);
});
