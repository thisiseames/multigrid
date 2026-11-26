import test from 'node:test';
import assert from 'node:assert/strict';
import { blueskyTopic, blueskyTopics, blueskyVideo, blueskyVideos, isPetVideo } from '../src/bluesky.js';

const post = (overrides = {}) => ({
  uri: 'at://did:plc:example/app.bsky.feed.post/3kabc',
  author: {
    did: 'did:plc:example',
    handle: 'example.bsky.social',
    displayName: 'Example',
    avatar: 'https://cdn.bsky.app/avatar.jpg',
  },
  record: { text: 'A clip from the feed', createdAt: '2026-11-25T12:00:00Z', langs: ['en'] },
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
  assert.equal(video.english, true);
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

test('a feed can keep only English videos, drops duplicates and other posts', () => {
  const data = {
    feed: [
      { post: post() },
      { post: post({ uri: 'at://did:plc:example/app.bsky.feed.post/3kes', record: { text: 'Un video en español', langs: ['es'] } }) },
      { post: post() },
      { post: post({ uri: 'at://did:plc:example/app.bsky.feed.post/3kother', embed: { $type: 'app.bsky.embed.external#view' } }) },
      { post: post({ uri: 'at://did:plc:example/app.bsky.feed.post/3ksecond' }) },
    ],
  };
  assert.deepEqual(blueskyVideos(data).map((video) => video.uri), [
    'at://did:plc:example/app.bsky.feed.post/3kabc',
    'at://did:plc:example/app.bsky.feed.post/3kes',
    'at://did:plc:example/app.bsky.feed.post/3ksecond',
  ]);
  assert.deepEqual(blueskyVideos(data, { englishOnly: true }).map((video) => video.uri), [
    'at://did:plc:example/app.bsky.feed.post/3kabc',
    'at://did:plc:example/app.bsky.feed.post/3ksecond',
  ]);
});

const trend = (overrides = {}) => ({
  link: '/profile/did:plc:example/feed/3kfeed',
  description: 'A short explanation of the story.',
  topic: 'The story',
  displayName: 'The story',
  ...overrides,
});

test('a Bluesky trend becomes a Today row with a public feed link', () => {
  assert.deepEqual(blueskyTopic(trend()), {
    name: 'The story',
    description: 'A short explanation of the story.',
    url: 'https://bsky.app/profile/did:plc:example/feed/3kfeed',
  });
});

test('trends without a usable feed link are dropped', () => {
  assert.equal(blueskyTopic(trend({ link: 'https://bsky.app/profile/example/feed/3kfeed' })), null);
  assert.equal(blueskyTopic(trend({ link: '/profile/example' })), null);
  assert.equal(blueskyTopic(trend({ displayName: '', topic: '' })), null);
});

test('a trend with no description still shows', () => {
  assert.deepEqual(blueskyTopic(trend({ description: '' })), {
    name: 'The story',
    description: '',
    url: 'https://bsky.app/profile/did:plc:example/feed/3kfeed',
  });
});

test('trends drop duplicates and stop at the five-topic limit', () => {
  const data = {
    topics: [
      trend(),
      trend(),
      trend({ displayName: 'Second', link: '/profile/did:plc:example/feed/3ksecond' }),
      trend({ displayName: 'Bad', link: '/profile/example' }),
      trend({ displayName: 'Third', link: '/profile/did:plc:example/feed/3kthird' }),
      trend({ displayName: 'Fourth', link: '/profile/did:plc:example/feed/3kfourth' }),
      trend({ displayName: 'Fifth', link: '/profile/did:plc:example/feed/3kfifth' }),
      trend({ displayName: 'Sixth', link: '/profile/did:plc:example/feed/3ksixth' }),
    ],
  };
  assert.deepEqual(blueskyTopics(data).map((topic) => topic.name), [
    'The story', 'Second', 'Third', 'Fourth', 'Fifth',
  ]);
  assert.deepEqual(blueskyTopics(data, 2).map((topic) => topic.name), ['The story', 'Second']);
  assert.deepEqual(blueskyTopics({ topics: [] }), []);
});

test('pet and cute posts are filtered out of the trending feed', () => {
  assert.equal(isPetVideo({ text: 'My cat did this today', alt: '' }), true);
  assert.equal(isPetVideo({ text: '', alt: 'A puppy playing in the snow' }), true);
  assert.equal(isPetVideo({ text: 'Election results are in', alt: 'A map of the country' }), false);
  assert.equal(isPetVideo({ text: 'Catalog update for the library', alt: '' }), false);
});
