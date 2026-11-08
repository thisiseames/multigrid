import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const now = Math.floor(Date.now() / 1000);
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({
    updated: now,
    channels: {
      CNN: [[now - 7200, now - 3600, 'Over'], [now - 600, now + 600, 'Inside Politics'], [now + 600, now + 4200, 'State of the Union']],
      SKYSPORTSPREMIERLEAGUE: [[now + 300, now + 3900, 'Live PL']],
    },
  }),
});
const { guideKey, loadGuide, nowAndNext, clock } = await import('../src/guide.js');

test('names match whatever the capitals, spaces and symbols', () => {
  assert.equal(guideKey('Sky Sports +'), guideKey('SKY SPORTS PLUS'));
  assert.equal(guideKey('ESPN 2'), guideKey('espn2'));
  assert.notEqual(guideKey('ESPN+'), guideKey('ESPN'));
});

test('now and next skip finished shows, and a gap shows only what is next', async () => {
  assert.equal(await loadGuide(true), true);
  const cnn = nowAndNext('CNN', { kind: 'iframe' });
  assert.equal(cnn.current.title, 'Inside Politics');
  assert.equal(cnn.next.title, 'State of the Union');
  const pl = nowAndNext('Sky Sports Premier League', { kind: 'iframe' });
  assert.equal(pl.current, null);
  assert.equal(pl.next.title, 'Live PL');
});

test('a YouTube channel with a TV channel name gets no listings', () => {
  assert.equal(nowAndNext('Sky Sports Premier League', { kind: 'youtube' }), null);
  assert.equal(nowAndNext('The Office', { kind: 'iframe' }), null);
});

test('times read like 2:00 pm', () => {
  assert.match(clock(Date.UTC(2026, 10, 8, 19, 0)), /^\d{1,2}:00 [ap]m$/);
});

test('every channel in the list has a schedule source and no name is used twice', () => {
  const { channels } = JSON.parse(readFileSync(new URL('../guide/channels.json', import.meta.url)));
  const keys = channels.flatMap((channel) => [...new Set(channel.names.map(guideKey))]);
  assert.equal(new Set(keys).size, keys.length);
  for (const channel of channels) assert.ok(channel.sky || channel.tvpassport, channel.names[0]);
});
