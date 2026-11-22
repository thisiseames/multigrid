import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHART_STALE_MS,
  chartArtwork,
  clearPodcastChartCache,
  loadPodcastCharts,
  parseAppleShowId,
  readPodcastCharts,
} from '../src/podcasts.js';

const now = Date.UTC(2026, 10, 22, 12, 0, 0);
const sample = (over = {}) => ({
  updated: now - 60_000,
  country: 'ca',
  shows: [
    {
      rank: 1, id: '1200361736', name: 'The Daily', author: 'The New York Times',
      art: 'https://is1-ssl.mzstatic.com/daily/600x600bb.jpg',
      appleUrl: 'https://podcasts.apple.com/ca/podcast/the-daily/id1200361736', genre: 'News',
    },
    {
      rank: 2, id: '1464919521', name: 'Dateline NBC', author: 'NBC News',
      art: 'http://is1-ssl.mzstatic.com/dateline/100x100bb.png',
      appleUrl: 'https://podcasts.apple.com/ca/podcast/dateline/id1464919521', genre: 'True Crime',
    },
  ],
  episodes: [
    {
      rank: 1, id: '1000803052523', title: 'Episode 686', source: 'Spittin Chiclets',
      image: 'https://is1-ssl.mzstatic.com/chiclets/600x600bb.jpg',
      audio: 'https://example.com/episode.mp3', length: 1800, time: now - 3600_000,
      appleUrl: 'https://podcasts.apple.com/ca/podcast/spittin-chiclets/id1112425552?i=1000803052523',
    },
  ],
  ...over,
});

test('chart artwork asks for the 600px version and show URLs give their ID', () => {
  assert.equal(
    chartArtwork('https://is1-ssl.mzstatic.com/image/thumb/Podcasts/abc.jpg/100x100bb.png'),
    'https://is1-ssl.mzstatic.com/image/thumb/Podcasts/abc.jpg/600x600bb.jpg',
  );
  assert.equal(
    parseAppleShowId('https://podcasts.apple.com/ca/podcast/the-daily/id1200361736'),
    '1200361736',
  );
  assert.equal(
    parseAppleShowId('https://podcasts.apple.com/ca/podcast/spittin-chiclets/id1112425552?i=1000803052523'),
    '1112425552',
  );
  assert.equal(parseAppleShowId('https://podcasts.apple.com/ca/podcast/no-id'), '');
});

test('the chart file is validated, secured and sorted', () => {
  const chart = readPodcastCharts(sample(), { now });
  assert.equal(chart.country, 'ca');
  assert.equal(chart.shows.length, 2);
  assert.equal(chart.shows[1].art, 'https://is1-ssl.mzstatic.com/dateline/100x100bb.png');
  assert.equal(chart.episodes[0].audio, 'https://example.com/episode.mp3');
  assert.equal(readPodcastCharts(sample({ updated: now - CHART_STALE_MS - 1 }), { now }), null);
  assert.equal(readPodcastCharts({ updated: now, shows: [], episodes: [] }, { now }), null);
  assert.equal(readPodcastCharts(null, { now }), null);
});

test('an http-only episode is not playable and is dropped', () => {
  const chart = readPodcastCharts(sample({
    episodes: [{ ...sample().episodes[0], audio: 'http://example.com/episode.mp3' }],
  }), { now });
  assert.equal(chart.episodes.length, 0);
});

test('the chart file is read once per cache window', async () => {
  clearPodcastChartCache();
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    assert.equal(url, 'podcast-charts.json');
    return { ok: true, json: async () => sample() };
  };
  const first = await loadPodcastCharts({ fetchImpl, now });
  const second = await loadPodcastCharts({ fetchImpl, now: now + 9 * 60_000 });
  assert.equal(first.shows.length, 2);
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
  const third = await loadPodcastCharts({ fetchImpl, now: now + 11 * 60_000 });
  assert.equal(third.shows.length, 2);
  assert.equal(calls, 2);
  clearPodcastChartCache();
});
