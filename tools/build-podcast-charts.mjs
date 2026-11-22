// Makes podcast-charts.json for the podcast directory: Apple's Top Shows and Trending Episodes
// for Canada. Apple's chart feed has no CORS header, so the app cannot read it directly; this
// small hourly job caches it. Trending episodes are resolved to their full audio through the
// public iTunes lookup, so they play in the dock. No key or account.
//   node tools/build-podcast-charts.mjs

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { chartArtwork, parseAppleShowId } from '../src/podcasts.js';

const SHOWS_URL = 'https://rss.applemarketingtools.com/api/v2/ca/podcasts/top/25/podcasts.json';
const EPISODES_URL = 'https://rss.applemarketingtools.com/api/v2/ca/podcasts/top/10/podcast-episodes.json';
const OUT = new URL('../podcast-charts.json', import.meta.url);
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
const https = (value) => {
  if (typeof value !== 'string' || !value) return '';
  return /^https:\/\//.test(value) ? value : '';
};

async function getJson(url, tries = 2) {
  let last;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': BROWSER },
        redirect: 'follow',
        signal: AbortSignal.timeout(45000),
      });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return await response.json();
    } catch (error) {
      last = error;
      if (attempt < tries) await pause(1200);
    }
  }
  throw last;
}

function chartShow(item, index) {
  const id = String(item?.id ?? '').trim();
  const name = clean(item?.name);
  if (!id || !name) return null;
  return {
    rank: index + 1,
    id,
    name,
    author: clean(item?.artistName),
    art: chartArtwork(item?.artworkUrl100),
    appleUrl: https(item?.url),
    genre: clean(item?.genres?.[0]?.name),
  };
}

function chartEpisode(item, rank, found) {
  const audio = https(found?.episodeUrl);
  if (!audio) return null;
  return {
    rank,
    id: String(item.id),
    title: clean(found.trackName || item.name),
    source: clean(found.collectionName || item.artistName) || 'Podcast',
    image: chartArtwork(found.artworkUrl600 || item.artworkUrl100),
    audio,
    length: Math.max(0, Math.round((Number(found.trackTimeMillis) || 0) / 1000)),
    time: Date.parse(found.releaseDate || '') || 0,
    appleUrl: https(found.trackViewUrl || item.url),
  };
}

async function trendingEpisodes(feed, previous) {
  const found = [];
  const lookups = new Map();
  for (const [index, item] of (feed?.feed?.results ?? feed?.results ?? []).entries()) {
    const showId = parseAppleShowId(item?.url);
    if (!showId) continue;
    let lookup = lookups.get(showId);
    if (!lookup) {
      try {
        lookup = await getJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(showId)}&entity=podcastEpisode&limit=200&country=CA`);
        lookups.set(showId, lookup);
        await pause(250);
      } catch (error) {
        console.warn(`Lookup failed for ${clean(item.artistName)}: ${error.message}`);
        continue;
      }
    }
    const match = (lookup?.results ?? []).find((entry) => String(entry?.trackId) === String(item.id));
    const episode = chartEpisode(item, index + 1, match);
    if (episode) found.push(episode);
    else console.warn(`Trending episode not playable: ${clean(item.name)}`);
  }
  return found.length ? found : (Array.isArray(previous?.episodes) ? previous.episodes : []);
}

const previous = (() => {
  try {
    return existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
  } catch {
    return null;
  }
})();

const showsFeed = await getJson(SHOWS_URL);
const shows = (showsFeed?.feed?.results ?? []).map(chartShow).filter(Boolean);
if (!shows.length) {
  console.error('Apple sent no Top Shows; podcast-charts.json was left as it was.');
  process.exit(1);
}

let episodes = [];
try {
  const episodesFeed = await getJson(EPISODES_URL);
  episodes = await trendingEpisodes(episodesFeed, previous);
} catch (error) {
  console.warn(`Trending episodes failed: ${error.message}; keeping the last ones.`);
  episodes = Array.isArray(previous?.episodes) ? previous.episodes : [];
}

const same = previous
  && JSON.stringify(previous.shows) === JSON.stringify(shows)
  && JSON.stringify(previous.episodes) === JSON.stringify(episodes);
if (same) {
  console.log(`podcast-charts.json is unchanged (${shows.length} shows, ${episodes.length} episodes).`);
  process.exit(0);
}

const updated = Date.parse(showsFeed?.feed?.updated || '') || Date.now();
writeFileSync(OUT, `${JSON.stringify({ updated, country: 'ca', shows, episodes }, null, 2)}\n`);
console.log(`podcast-charts.json: ${shows.length} shows, ${episodes.length} trending episodes.`);
for (const show of shows.slice(0, 5)) console.log(`  ${show.rank}. ${show.name} — ${show.author}`);
for (const episode of episodes.slice(0, 3)) console.log(`  ${episode.rank}. ${episode.title} — ${episode.source}`);
