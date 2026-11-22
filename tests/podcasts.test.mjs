import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPodcastCache,
  followedShowInput,
  isPodcastShowInput,
  lookupShowEpisodes,
  normalizeEpisode,
  normalizeShow,
  searchEpisodes,
  searchShows,
  sameShowName,
  showIdFromInput,
  showNameKey,
} from '../src/podcasts.js';

const show = (over = {}) => ({
  wrapperType: 'collection', kind: 'podcast', collectionId: 1200361736,
  collectionName: 'The Daily', artistName: 'The New York Times',
  artworkUrl600: 'https://is1-ssl.mzstatic.com/daily.jpg',
  collectionViewUrl: 'https://podcasts.apple.com/ca/podcast/the-daily/id1200361736',
  trackCount: 2000,
  ...over,
});

const episode = (over = {}) => ({
  wrapperType: 'podcastEpisode', kind: 'podcast-episode', trackId: 1000803037306,
  trackName: 'Elon Goes Woke', collectionName: 'Pod Save America',
  artworkUrl600: 'https://is1-ssl.mzstatic.com/psa.jpg',
  episodeUrl: 'https://dts.podtrac.com/redirect.mp3/audioboom.com/posts/8979294.mp3',
  episodeFileExtension: 'mp3', episodeContentType: 'audio',
  trackTimeMillis: 4092000, releaseDate: '2026-11-20T10:55:00Z',
  trackViewUrl: 'https://podcasts.apple.com/ca/podcast/pod-save-america/id1192761536',
  ...over,
});

const reply = (results) => ({ ok: true, json: async () => ({ resultCount: results.length, results }) });

test('normalise a show and keep a secure picture', () => {
  const item = normalizeShow(show({ artworkUrl600: 'http://is1-ssl.mzstatic.com/daily.jpg' }));
  assert.equal(item.id, '1200361736');
  assert.equal(item.name, 'The Daily');
  assert.equal(item.author, 'The New York Times');
  assert.equal(item.art, 'https://is1-ssl.mzstatic.com/daily.jpg');
  assert.match(item.appleUrl, /^https:\/\/podcasts\.apple\.com\//);
  assert.equal(normalizeShow({ kind: 'song', collectionId: 1, collectionName: 'x' }), null);
  assert.equal(normalizeShow(show({ collectionName: '' })), null);
});

test('normalise a full podcast episode and reject clips, previews and other media', () => {
  const item = normalizeEpisode(episode());
  assert.equal(item.id, '1000803037306');
  assert.equal(item.title, 'Elon Goes Woke');
  assert.equal(item.source, 'Pod Save America');
  assert.equal(item.audio, 'https://dts.podtrac.com/redirect.mp3/audioboom.com/posts/8979294.mp3');
  assert.equal(item.length, 4092);
  assert.equal(new Date(item.time).toISOString(), '2026-11-20T10:55:00.000Z');
  assert.equal(normalizeEpisode(episode({ episodeUrl: 'http://example.com/a.mp3' })), null);
  assert.equal(normalizeEpisode(episode({ episodeUrl: '' })), null);
  assert.equal(normalizeEpisode(episode({ episodeFileExtension: 'mp4' })), null);
  assert.equal(normalizeEpisode(episode({ kind: 'song' })), null);
});

test('followed show inputs round-trip', () => {
  const input = followedShowInput(1200361736);
  assert.equal(input, 'podcastshow:1200361736');
  assert.equal(isPodcastShowInput(input), true);
  assert.equal(isPodcastShowInput('audio:x|https://a'), false);
  assert.equal(showIdFromInput(input), '1200361736');
});

test('the reader and the store recognise the same show without merging short lookalikes', () => {
  assert.equal(showNameKey('No Question About That - a Manchester United podcast'), 'no question about that');
  assert.equal(showNameKey('The Daily Podcast'), 'the daily');
  assert.equal(sameShowName('No Question About That', 'No Question About That - a Manchester United podcast'), true);
  assert.equal(sameShowName('No Question About That', 'NO QUESTION ABOUT THAT'), true);
  assert.equal(sameShowName('The Daily', 'The Daily Show'), false);
  assert.equal(sameShowName('Front Burner', 'On the Front Burner – Specialty Produce Network'), false);
});

test('show search asks the Canadian podcast directory once and then uses its answer', async () => {
  clearPodcastCache();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return reply([show()]);
  };
  const first = await searchShows('The Daily', { fetchImpl, now: 1000 });
  const second = await searchShows('the daily', { fetchImpl, now: 2000 });
  assert.equal(first.length, 1);
  assert.deepEqual(second, first);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0]);
  assert.equal(url.hostname, 'itunes.apple.com');
  assert.equal(url.searchParams.get('media'), 'podcast');
  assert.equal(url.searchParams.get('entity'), 'podcast');
  assert.equal(url.searchParams.get('country'), 'CA');
});

test('topic episode search drops tiny clips and duplicate episodes', async () => {
  clearPodcastCache();
  const fetchImpl = async () => reply([
    episode({ trackId: 1, trackName: 'Long one', trackTimeMillis: 1800000 }),
    episode({ trackId: 2, trackName: 'Two minute clip', trackTimeMillis: 120000 }),
    episode({ trackId: 1, trackName: 'Long one again', trackTimeMillis: 1800000 }),
    episode({ trackId: 3, trackName: 'Video only', episodeFileExtension: 'mp4', trackTimeMillis: 1800000 }),
  ]);
  const items = await searchEpisodes('Toronto', { fetchImpl });
  assert.deepEqual(items.map((item) => item.title), ['Long one']);
});

test('a broken connection becomes the quiet message, not a raw fetch error', async () => {
  clearPodcastCache();
  await assert.rejects(
    searchShows('Front Burner', { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }),
    /Apple didn't answer\./,
  );
  clearPodcastCache();
  await assert.rejects(
    searchShows('Front Burner', { fetchImpl: async () => ({ ok: false, status: 429 }) }),
    /Apple is limiting searches/,
  );
});

test('a followed show returns its newest episodes first and skips the show itself', async () => {
  clearPodcastCache();
  const fetchImpl = async () => reply([
    show(),
    episode({ trackId: 10, trackName: 'Older', releaseDate: '2026-11-18T10:00:00Z' }),
    episode({ trackId: 11, trackName: 'Newer', releaseDate: '2026-11-20T10:00:00Z' }),
    episode({ trackId: 12, trackName: 'No audio', episodeUrl: '' }),
  ]);
  const items = await lookupShowEpisodes('1200361736', { fetchImpl });
  assert.deepEqual(items.map((item) => item.title), ['Newer', 'Older']);
});
