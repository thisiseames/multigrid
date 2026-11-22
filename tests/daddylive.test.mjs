import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDaddyLive } from '../src/daddylive.js';

const link = (id, source = 'tv19') => `https://daddylive.app/player/embed.php?id=${id}&source=${source}`;

const event = (name, source, channels, time = 'Live') => ({
  time,
  event: name,
  source,
  channels,
});

const data = {
  categories: {
    'Live Events': [
      event('🏎️ Las Vegas Grand Prix - Race', 'tv19', [
        { channel_name: 'Link - 1', url: link('a') },
        { channel_name: 'Link - 2', url: link('b') },
        { channel_name: 'Same link again', url: link('a') },
      ]),
      event('', 'tv19', [{ channel_name: 'Link - 1', url: link('missing') }]),
      event('Bad links only', 'tv19', [
        { channel_name: 'Link - 1', url: 'https://example.com/player/embed.php?id=x' },
        { channel_name: 'Link - 2', url: 'http://daddylive.app/player/embed.php?id=x' },
        { channel_name: 'Link - 3', url: 'https://daddylive.app/other' },
      ]),
    ],
    'Formula 1': [
      event('Las Vegas Grand Prix - Race', 'tv5', [
        { channel_name: 'Link - 1', url: link('c', 'tv5') },
      ], '04:00'),
      event('United States Grand Prix', 'tv17', [
        { channel_name: 'Link - 1', url: link('d', 'tv17') },
      ], '04:00'),
    ],
    'formula 1': [
      event('United States Grand Prix', 'tv18', [
        { channel_name: 'Link - 1', url: link('e', 'tv18') },
      ], '04:00'),
    ],
  },
};

test('Daddy Live merges duplicate events and keeps every distinct link', () => {
  const list = normalizeDaddyLive(data);
  assert.deepEqual(list.map((item) => item.name), [
    'Las Vegas Grand Prix - Race',
    'United States Grand Prix',
  ]);
  const race = list[0];
  assert.equal(race.input, link('a'));
  assert.equal(race.live, true);
  assert.equal(race.category, 'Formula 1');
  assert.deepEqual(race.categories, ['Formula 1', 'Live Events']);
  assert.deepEqual(race.sources, ['tv19', 'tv5']);
  assert.deepEqual(race.channels.map((channel) => channel.name), ['Link 1', 'Link 2', 'Link 1']);
  assert.deepEqual(race.channels.map((channel) => channel.source), ['tv19', 'tv19', 'tv5']);
  assert.deepEqual(race.channels.map((channel) => channel.url), [link('a'), link('b'), link('c', 'tv5')]);
});

test('Daddy Live merges categories that differ only by case', () => {
  const list = normalizeDaddyLive(data);
  const us = list.find((item) => item.name === 'United States Grand Prix');
  assert.equal(us.category, 'Formula 1');
  assert.deepEqual(us.categories, ['Formula 1']);
  assert.deepEqual(us.sources, ['tv17', 'tv18']);
  assert.equal(us.channels.length, 2);
});

test('Daddy Live drops missing events and links that are not its player', () => {
  const list = normalizeDaddyLive(data);
  assert.ok(!list.some((item) => item.name === 'Bad links only'));
  assert.ok(!list.some((item) => !item.name));
  assert.ok(list.every((item) => item.channels.every((channel) => (
    channel.url.startsWith('https://daddylive.app/player/embed.php?')
  ))));
});

test('Daddy Live handles an empty or malformed answer quietly', () => {
  assert.deepEqual(normalizeDaddyLive({}), []);
  assert.deepEqual(normalizeDaddyLive({ categories: { Soccer: 'not a list' } }), []);
  assert.deepEqual(normalizeDaddyLive(null), []);
});
