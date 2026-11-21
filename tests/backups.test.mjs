import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FEEDS, buildFeedIndex, feedsFor, nextFeed } from '../src/backups.js';

const feed = (channel, url, quality = null) => ({ channel, url, quality });

test('a channel keeps its feeds in quality order, without duplicates or links a secure page cannot play', () => {
  const index = buildFeedIndex([
    feed('cnn', 'https://a.example/one.m3u8', '720p'),
    feed('cnn', 'https://a.example/two.m3u8', '1080p'),
    feed('cnn', 'http://a.example/plain-http.m3u8', '1080p'),
    feed('cnn', 'https://a.example/not-a-stream.mp4', '1080p'),
    feed('cnn', 'https://a.example/one.m3u8', '720p'),
    feed('cnn', 'https://a.example/no-quality.m3u8'),
    { channel: '', url: 'https://a.example/no-channel.m3u8', quality: '1080p' },
    feed('other', 'https://b.example/one.m3u8', '480p'),
  ]);

  assert.equal(MAX_FEEDS, 6);
  assert.deepEqual(feedsFor('https://a.example/one.m3u8', index), [
    'https://a.example/two.m3u8',
    'https://a.example/one.m3u8',
    'https://a.example/no-quality.m3u8',
  ]);
  assert.deepEqual(feedsFor('https://b.example/one.m3u8', index), ['https://b.example/one.m3u8']);
  assert.deepEqual(feedsFor('https://a.example/plain-http.m3u8', index), []);
  assert.deepEqual(feedsFor('https://unknown.example/x.m3u8', index), []);
});

test('the next feed skips the one playing and anything already tried', () => {
  const index = buildFeedIndex([
    feed('cnn', 'https://a.example/one.m3u8', '720p'),
    feed('cnn', 'https://a.example/two.m3u8', '1080p'),
    feed('cnn', 'https://a.example/three.m3u8', '480p'),
  ]);
  const input = 'https://a.example/one.m3u8';

  assert.equal(nextFeed(input, input, new Set(), index), 'https://a.example/two.m3u8');
  assert.equal(nextFeed(input, 'https://a.example/two.m3u8', new Set(), index), 'https://a.example/one.m3u8');
  assert.equal(nextFeed(input, input, new Set(['https://a.example/two.m3u8']), index), 'https://a.example/three.m3u8');
  assert.equal(nextFeed(input, input, new Set(['https://a.example/two.m3u8', 'https://a.example/three.m3u8']), index), null);
  assert.equal(nextFeed('https://unknown.example/x.m3u8', input, new Set(), index), null);
});

test('a channel is capped at six feeds, but an older saved link still finds them', () => {
  const streams = Array.from({ length: 8 }, (_, i) => feed(
    'many',
    `https://a.example/${i + 1}.m3u8`,
    `${1080 - i * 60}p`,
  ));
  const index = buildFeedIndex(streams);
  const feeds = feedsFor('https://a.example/1.m3u8', index);

  assert.equal(feeds.length, MAX_FEEDS);
  assert.deepEqual(feeds, [
    'https://a.example/1.m3u8',
    'https://a.example/2.m3u8',
    'https://a.example/3.m3u8',
    'https://a.example/4.m3u8',
    'https://a.example/5.m3u8',
    'https://a.example/6.m3u8',
  ]);

  // The 8th feed is outside the kept list, but a favorite saved on it can still recover.
  assert.equal(nextFeed('https://a.example/8.m3u8', 'https://a.example/8.m3u8', new Set(), index), 'https://a.example/1.m3u8');
});
