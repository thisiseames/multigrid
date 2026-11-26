// Makes lists.json: the nine IMDb and Rotten Tomatoes rows on the Home screen.
//   · IMDb's MOVIEmeter and TVMeter charts, Col Needham's Hidden Gems, and the Nielsen
//     Streaming TV Top 100, read through r.jina.ai (IMDb answers direct requests with a challenge).
//   · Rotten Tomatoes' Certified Fresh and Verified Hot browse pages, its two "Best of the year"
//     guides, and its Most Popular TV page, read from the public pages themselves.
// No key and no backend. A list that fails keeps its last good copy; a run that changes nothing
// leaves the file alone, so the Action only commits when the lists really moved.
// Run by .github/workflows/lists.yml.
//   node tools/build-lists.mjs [--force]

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  imdbChartRows,
  imdbListRows,
  imdbStreamingRows,
  rtBrowseRows,
  rtEditorialRows,
} from './lists-rows.mjs';

const FILE = new URL('../lists.json', import.meta.url);
const UA = 'MULTIGRID-lists/1.0 (personal TV app; github.com/thisiseames/multigrid)';
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const now = Date.now();
const force = process.argv.includes('--force');
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

const SOURCES = [
  {
    id: 'imdb-moviemeter', source: 'IMDb', name: 'MOVIEmeter', kind: 'film',
    url: 'https://www.imdb.com/chart/moviemeter/',
    read: async () => imdbChartRows(await jinaAsk('https://www.imdb.com/chart/moviemeter/'), 'film'),
  },
  {
    id: 'imdb-hidden-gems', source: 'IMDb', name: 'Hidden Gems', kind: 'film',
    url: 'https://www.imdb.com/list/ls4156640917/',
    read: async () => imdbListRows(await jinaAsk('https://www.imdb.com/list/ls4156640917/'), 'film'),
  },
  {
    id: 'imdb-most-popular', source: 'IMDb', name: 'Most Popular', kind: 'show',
    url: 'https://www.imdb.com/chart/tvmeter/',
    read: async () => imdbChartRows(await jinaAsk('https://www.imdb.com/chart/tvmeter/'), 'show'),
  },
  {
    id: 'imdb-streaming', source: 'IMDb', name: 'Popular on Streaming', kind: 'show',
    url: 'https://www.imdb.com/list/ls532325552/',
    read: async () => imdbStreamingRows(await jinaAsk('https://www.imdb.com/list/ls532325552/'), 'show'),
  },
  {
    id: 'rt-certified', source: 'Rotten Tomatoes', name: 'Certified Fresh', kind: 'film',
    url: 'https://www.rottentomatoes.com/browse/movies_at_home/critics:certified_fresh~sort:popular',
    read: async () => rtBrowseRows(await rt('https://www.rottentomatoes.com/browse/movies_at_home/critics:certified_fresh~sort:popular'), 'film'),
  },
  {
    id: 'rt-verified-hot', source: 'Rotten Tomatoes', name: 'Verified Hot', kind: 'film',
    url: 'https://www.rottentomatoes.com/browse/movies_at_home/audience:verified_hot',
    read: async () => rtBrowseRows(await rt('https://www.rottentomatoes.com/browse/movies_at_home/audience:verified_hot'), 'film'),
  },
  {
    id: 'rt-best-movies', source: 'Rotten Tomatoes', name: 'Best Movies', kind: 'film',
    url: 'https://editorial.rottentomatoes.com/guide/best-new-movies/',
    read: async () => {
      const markdown = await jinaAsk('https://editorial.rottentomatoes.com/guide/best-new-movies/');
      return rtEditorialRows(markdown, { kind: 'film', year: articleYear(markdown) });
    },
  },
  {
    id: 'rt-best-tv', source: 'Rotten Tomatoes', name: 'Best TV', kind: 'show',
    url: 'https://editorial.rottentomatoes.com/guide/best-new-tv-series-shows/',
    read: async () => {
      const markdown = await jinaAsk('https://editorial.rottentomatoes.com/guide/best-new-tv-series-shows/');
      return rtEditorialRows(markdown, { kind: 'show', year: articleYear(markdown) });
    },
  },
  {
    id: 'rt-popular-tv', source: 'Rotten Tomatoes', name: 'Most Popular TV', kind: 'show',
    url: 'https://www.rottentomatoes.com/browse/tv_series_browse/sort:popular',
    read: async () => rtBrowseRows(await rt('https://www.rottentomatoes.com/browse/tv_series_browse/sort:popular'), 'show'),
  },
];

function articleYear(markdown) {
  const found = String(markdown || '').match(/Title:[^\n]*\b(20\d{2})\b/);
  return found ? Number(found[1]) : new Date(now).getFullYear();
}

async function fetchText(url, headers, tries = 3) {
  let last = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const response = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`answered ${response.status}`);
      return await response.text();
    } catch (error) {
      last = error;
      if (attempt < tries) await pause(attempt * 6000);
    }
  }
  throw last;
}

let lastJina = 0;

/** IMDb and fallback reads through Jina: no challenge, but it rate-limits, so asks are spaced. */
async function jinaAsk(url, { html = false } = {}) {
  const wait = 5000 - (Date.now() - lastJina);
  if (lastJina && wait > 0) await pause(wait);
  lastJina = Date.now();
  return fetchText(`https://r.jina.ai/${url}`, {
    'User-Agent': UA,
    'Accept-Language': 'en-US,en;q=0.9',
    ...(html ? { 'X-Return-Format': 'html' } : {}),
  });
}

/** Rotten Tomatoes directly, falling back to the reader's HTML when its IP is refused. */
async function rt(url) {
  try {
    const html = await fetchText(url, {
      'User-Agent': BROWSER,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    }, 2);
    if (html.includes('discovery-media-list-item')) return html;
  } catch { /* try the reader */ }
  return jinaAsk(url, { html: true });
}

let old = {};
try { old = JSON.parse(readFileSync(FILE, 'utf8')); } catch { /* first run */ }
const kept = new Map((old.lists ?? []).map((list) => [list.id, list]));
const lists = [];

for (const source of SOURCES) {
  const previous = kept.get(source.id);
  try {
    if (source.id.startsWith('rt-')) await pause(800);
    const entries = (await source.read()).slice(0, 20);
    if (entries.length < 10) throw new Error(`only ${entries.length} titles`);
    lists.push({ id: source.id, source: source.source, name: source.name, kind: source.kind, url: source.url, entries });
    console.log(`${source.source} · ${source.name}: ${entries.length} titles, first ${entries[0].title}`);
  } catch (error) {
    console.warn(`${source.source} · ${source.name}: ${error.message}; keeping the last one.`);
    if (previous?.entries?.length) lists.push(previous);
  }
}

if (!lists.length) {
  console.error('No list answered, so lists.json was left as it was.');
  process.exit(0);
}

const next = { updated: Math.floor(now / 1000), lists };
const same = JSON.stringify(old.lists ?? []) === JSON.stringify(lists);
if (same && !force) {
  console.log(`lists.json: unchanged (${lists.length} lists).`);
  process.exit(0);
}
writeFileSync(FILE, JSON.stringify(next));
console.log(`lists.json: ${lists.length} lists, ${lists.reduce((sum, list) => sum + list.entries.length, 0)} titles.`);
