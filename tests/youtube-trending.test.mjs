import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_SECONDS, YOUTUBE_CATEGORIES, categoryRows, durationSeconds, videoRow } from '../tools/youtube-trending-rows.mjs';

const video = (id, overrides = {}) => ({
  id,
  snippet: {
    title: 'A video title',
    channelTitle: 'A channel',
    publishedAt: '2026-11-26T12:00:00Z',
    liveBroadcastContent: 'none',
    thumbnails: { high: { url: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg' } },
    ...overrides.snippet,
  },
  statistics: overrides.statistics ?? { viewCount: '123456' },
  contentDetails: overrides.contentDetails ?? { duration: 'PT4M13S' },
});

test('durations read hours, minutes and seconds; Shorts are rejected', () => {
  assert.equal(durationSeconds('PT4M13S'), 253);
  assert.equal(durationSeconds('PT1H2M3S'), 3723);
  assert.equal(durationSeconds('PT45S'), 45);
  assert.equal(durationSeconds('P0D'), 0);
  assert.equal(durationSeconds('nonsense'), 0);
  assert.equal(videoRow(video('abcdefghijk', { contentDetails: { duration: 'PT2M' } })), null);
  assert.equal(videoRow(video('abcdefghijk', { contentDetails: { duration: `PT${MIN_SECONDS}S` } }))?.id, 'abcdefghijk');
});

test('a valid video becomes a tidy card and short/live/bad rows are dropped', () => {
  const row = videoRow(video('abcdefghijk', { snippet: { title: 'Tom &amp; Jerry', channelTitle: 'Cartoons' } }));
  assert.equal(row.id, 'abcdefghijk');
  assert.equal(row.title, 'Tom & Jerry');
  assert.equal(row.channel, 'Cartoons');
  assert.equal(row.views, 123456);
  assert.equal(row.duration, 253);
  assert.match(row.thumbnail, /^https:\/\/i\.ytimg\.com\//);
  assert.equal(videoRow(video('abcdefghijk', { snippet: { liveBroadcastContent: 'live' } })), null);
  assert.equal(videoRow(video('short', {})), null);
  assert.equal(videoRow({ ...video('abcdefghijk'), snippet: { ...video('abcdefghijk').snippet, title: '' } }), null);
});

test('categoryRows removes duplicates and keeps the best 12', () => {
  const items = Array.from({ length: 15 }, (_, index) => video(`abcdefghij${String.fromCharCode(97 + index)}`));
  const rows = categoryRows([...items, items[0]], 12);
  assert.equal(rows.length, 12);
  assert.equal(new Set(rows.map((row) => row.id)).size, 12);
});

test('the selected categories are the approved nine, without Film & Animation or Education', () => {
  assert.deepEqual(YOUTUBE_CATEGORIES.map((category) => category.name), [
    'All', 'Music', 'Sports', 'Comedy', 'Entertainment', 'News & Politics', 'Science & Technology', 'Movies', 'Shows',
  ]);
  assert.ok(YOUTUBE_CATEGORIES.every((category) => category.id === 'all' || /^\d+$/.test(category.api)));
  assert.ok(!YOUTUBE_CATEGORIES.some((category) => category.api === '1' || category.api === '27'));
});
