import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePPV, todayPPV } from '../src/ppv.js';

const now = 1800000000000;
const stream = (over = {}) => ({
  id: 1,
  name: 'Game',
  tag: 'TV',
  source_tag: 'HD',
  poster: 'https://img.test/poster.jpg',
  starts_at: 1799999700,
  ends_at: 1800003600,
  always_live: 0,
  allowpaststreams: 0,
  category_name: 'Basketball',
  iframe: 'https://player.test/embed',
  ...over,
});

const data = {
  streams: [{
    category: 'Basketball',
    streams: [
      stream({ id: 1, name: 'Live game' }),
      stream({ id: 2, name: 'Upcoming game', starts_at: 1800003600, ends_at: 1800007200 }),
      stream({ id: 3, name: '24/7 channel', starts_at: 0, ends_at: 0, always_live: 1 }),
      stream({ id: 4, name: 'Past game', starts_at: 1799990000, ends_at: 1799999000 }),
      stream({ id: 5, name: 'Past allowed', starts_at: 1799990000, ends_at: 1799999000, allowpaststreams: 1 }),
      stream({ id: 6, name: 'Sub only', starts_at: 1800007200, ends_at: 1800010800, iframe: '', substreams: [{ iframe: 'http://player.test/sub' }], poster: 'http://img.test/sub.jpg' }),
      stream({ id: 7, name: '', iframe: '' }),
      stream({ id: 8, name: 'No stream', iframe: '', substreams: [] }),
    ],
  }],
};

test('the PPV list puts live events first, then upcoming, then always-on channels', () => {
  const list = normalizePPV(data, now);
  assert.deepEqual(list.map((item) => item.name), ['Live game', 'Upcoming game', 'Sub only', '24/7 channel', 'Past allowed']);
  assert.equal(list[0].live, true);
  assert.equal(list[1].upcoming, true);
  assert.equal(list[2].upcoming, true);
  assert.equal(list[3].always, true);
  assert.equal(list[4].live, false);
});

test('live events that started most recently come first', () => {
  const list = normalizePPV({ streams: [{ category: 'Football', streams: [
    stream({ id: 1, name: 'Started at noon', starts_at: 1799985600, ends_at: 1800014400 }),
    stream({ id: 2, name: 'Started at three', starts_at: 1799996400, ends_at: 1800025200 }),
  ] }] }, now);
  assert.deepEqual(list.map((item) => item.name), ['Started at three', 'Started at noon']);
});

test('Today leaves out college sports, hockey, darts and always-on channels', () => {
  const event = (name, over = {}) => ({
    name, category: 'Football', tag: 'LaLiga', source: 'HD', always: false, live: true, upcoming: false, starts: now - 1800000, ...over,
  });
  const list = todayPPV([
    event('Real Madrid vs. Celta Vigo'),
    event('BYU Cougars at Kansas Jayhawks', { category: 'American Football', tag: 'College Football' }),
    event('College basketball', { category: 'Basketball', tag: 'College Basketball' }),
    event('NHL game', { category: 'Ice Hockey', tag: 'NHL' }),
    event('WWE Raw', { category: 'Wrestling', tag: 'WWE' }),
    event('Grand Slam of Darts | Day 9', { category: 'Darts', tag: 'PDC' }),
    event('World Darts Championship', { category: 'Other', tag: 'PDC' }),
    event('NBA game', { category: 'Basketball', tag: 'NBA' }),
    event('24/7 channel', { always: true }),
    event('Upcoming soccer', { tag: 'MLS', live: false, upcoming: true, starts: now + 3600000 }),
    event('Too far away', { tag: 'MLS', live: false, upcoming: true, starts: now + 7 * 3600000 }),
  ], now);
  assert.deepEqual(list.map((item) => item.name), ['Real Madrid vs. Celta Vigo', 'NBA game', 'Upcoming soccer']);
});

test('the PPV list drops ice hockey and wrestling', () => {
  const data = { streams: [
    { category: 'Ice Hockey', streams: [stream({ id: 1, name: 'NHL game', category_name: 'Ice Hockey' })] },
    { category: 'Wrestling', streams: [stream({ id: 2, name: 'WWE Raw', category_name: 'Wrestling' })] },
    { category: 'Football', streams: [stream({ id: 3, name: 'Football game', category_name: 'Football' })] },
  ] };
  assert.deepEqual(normalizePPV(data, now).map((item) => item.name), ['Football game']);
});

test('the PPV list drops past streams unless the service allows them', () => {
  const names = normalizePPV(data, now).map((item) => item.name);
  assert.ok(!names.includes('Past game'));
  assert.ok(names.includes('Past allowed'));
});

test('the PPV list accepts a substream and upgrades http pictures and embeds', () => {
  const sub = normalizePPV(data, now).find((item) => item.name === 'Sub only');
  assert.equal(sub.input, 'https://player.test/sub');
  assert.equal(sub.poster, 'https://img.test/sub.jpg');
  assert.deepEqual(sub.colors, []);
});

test('the PPV list skips entries with no name or no playable address', () => {
  const names = normalizePPV(data, now).map((item) => item.name);
  assert.ok(!names.includes('No stream'));
  assert.ok(!names.includes(''));
});

test('darts is spotted in any source: a PPV.st category, a Daddy Live category list, a Matchora sport or a name', async () => {
  const { isDarts } = await import('../src/ppv.js');
  assert.ok(isDarts({ category: 'Darts', name: 'Grand Slam' }));
  assert.ok(isDarts({ categories: ['Live Events', 'Darts'], name: 'PDC' }));
  assert.ok(isDarts({ sport: 'darts', name: 'Final' }));
  assert.ok(isDarts({ name: 'Grand Slam of Darts | Final' }));
  assert.ok(!isDarts({ category: 'Football', name: 'Dartford vs. Maidstone' }));
  assert.ok(!isDarts(null));
});
