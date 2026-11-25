import test from 'node:test';
import assert from 'node:assert/strict';
import { blueskyVideo, blueskyVideos } from '../src/bluesky.js';

const post = (overrides = {}) => ({
  uri: 'at://did:plc:example/app.bsky.feed.post/3kabc',
  author: {
    did: 'did:plc:example',
    handle: 'example.bsky.social',
    displayName: 'Example',
    avatar: 'https://cdn.bsky.app/avatar.jpg',
  },
  record: { text: 'A clip from the feed', createdAt: '2026-11-25T12:00:00Z' },
  indexedAt: '2026-11-25T12:01:00Z',
  likeCount: 12,
  repostCount: 3,
  embed: {
    $type: 'app.bsky.embed.video#view',
    playlist: 'https://video.bsky.app/watch/did/playlist.m3u8',
    thumbnail: 'https://video.bsky.app/watch/did/thumbnail.jpg',
    aspectRatio: { width: 1080, height: 1920 },
  },
  ...overrides,
});

test('a Bluesky video post becomes a playable feed item', () => {
  const video = blueskyVideo(post());
  assert.equal(video.handle, 'example.bsky.social');
  assert.equal(video.name, 'Example');
  assert.equal(video.portrait, true);
  assert.equal(video.playlist, 'https://video.bsky.app/watch/did/playlist.m3u8');
  assert.equal(video.url, 'https://bsky.app/profile/example.bsky.social/post/3kabc');
  assert.equal(video.text, 'A clip from the feed');
});

test('video inside a quoted post still counts, and posts without video do not', () => {
  const quoted = post({
    uri: 'at://did:plc:example/app.bsky.feed.post/3kquoted',
    embed: {
      $type: 'app.bsky.embed.recordWithMedia#view',
      media: {
        $type: 'app.bsky.embed.video#view',
        playlist: 'https://video.bsky.app/watch/quoted/playlist.m3u8',
        aspectRatio: { width: 1920, height: 1080 },
      },
    },
  });
  assert.equal(blueskyVideo(quoted).portrait, false);
  assert.equal(blueskyVideo({ ...post(), embed: { $type: 'app.bsky.embed.images#view' } }), null);
});

test('a feed keeps videos, drops duplicates and other posts', () => {
  const data = {
    feed: [
      { post: post() },
      { post: post() },
      { post: post({ uri: 'at://did:plc:example/app.bsky.feed.post/3kother', embed: { $type: 'app.bsky.embed.external#view' } }) },
      { post: post({ uri: 'at://did:plc:example/app.bsky.feed.post/3ksecond' }) },
    ],
  };
  assert.deepEqual(blueskyVideos(data).map((video) => video.uri), [
    'at://did:plc:example/app.bsky.feed.post/3kabc',
    'at://did:plc:example/app.bsky.feed.post/3ksecond',
  ]);
});
