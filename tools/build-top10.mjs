// Makes top10.json: what Canada is watching, for the home screen and the Charts tabs.
//   · Netflix's official weekly Top 10 shows in Canada, from the file Netflix publishes for
//     anyone (netflix.com/tudum/top10). New weeks come out on Tuesdays; the 33 MB file is only
//     fetched once the stored week is a week old, and then at most every 6 hours until it lands.
//     Each title's picture, story and Netflix page come from JustWatch's search.
//   · JustWatch's 10 most popular titles in Canada across every service, from the question its
//     own website asks (no key; unofficial, so if it stops answering the old list is kept).
//     Asked once a day.
// Each title gets a trailer, found on YouTube and checked by title; known ones are kept.
// Run by .github/workflows/guide.yml.
//   node tools/build-top10.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { findVideo, words } from './youtube-find.mjs';
import { justWatchTitles, netflixMatch, netflixWeek } from './top10-rows.mjs';

const FILE = new URL('../top10.json', import.meta.url);
const NETFLIX = 'https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv';
const JUSTWATCH = 'https://apis.justwatch.com/graphql';
const UA = 'MULTIGRID-top10/1.0 (personal TV app; github.com/thisiseames/multigrid)';
const HOUR = 3600000;
const now = Date.now();
const force = process.argv.includes('--force');
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

let old = {};
try { old = JSON.parse(readFileSync(FILE, 'utf8')); } catch { /* first run */ }
const charts = Object.fromEntries((old.charts ?? []).map((chart) => [chart.id, chart]));
// A list saved before scores were added (no entry has 'imdb' or 'rt') is fetched again once.
const scored = (chart) => (chart?.entries ?? []).some((entry) => 'imdb' in entry || 'rt' in entry);

async function netflix() {
  const had = charts.netflix;
  const weekEnds = had?.week ? Date.parse(`${had.week}T12:00:00Z`) : 0;
  if (!force && had && scored(had) && (now - weekEnds < 8.5 * 24 * HOUR || now - (had.checked || 0) < 6 * HOUR)) return had;
  const response = await fetch(NETFLIX, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Netflix answered ${response.status}`);
  const found = netflixWeek(await response.text(), 'CA', 'TV');
  if (!found) throw new Error("Netflix's file had no Canadian week");
  const entries = [];
  for (const entry of found.entries) {
    // Its picture, story and own page, from JustWatch; a Netflix search if JustWatch can't say.
    const extra = await justWatch(SEARCH, { query: entry.title }).then((answer) => netflixMatch(answer, entry.title)).catch(() => null);
    entries.push({ ...entry, service: 'Netflix', url: extra?.url || `https://www.netflix.com/search?q=${encodeURIComponent(entry.title)}`, image: extra?.image || '', desc: extra?.desc || '', ...(extra?.scores ?? {}) });
    await pause(400);
  }
  return { id: 'netflix', name: 'Netflix', source: 'Netflix Top 10 · Canada', week: found.week, checked: now, entries };
}

async function justWatch(query, variables = {}) {
  const response = await fetch(JUSTWATCH, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { country: 'CA', language: 'en', ...variables } }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`JustWatch answered ${response.status}`);
  return response.json();
}

// The same title, searched among what's on Netflix ("nfx") in Canada.
const SEARCH = `query($country: Country!, $language: Language!, $query: String!) {
  searchTitles(source: "multigrid", country: $country, first: 4, filter: { searchQuery: $query, objectTypes: [SHOW], packages: ["nfx"] }) { edges { node {
    ... on MovieOrShow {
      content(country: $country, language: $language) { title shortDescription backdrops { backdropUrl } scoring { imdbScore imdbVotes tomatoMeter certifiedFresh } }
      offers(country: $country, platform: WEB) { standardWebURL }
    } } } } }`;

const QUESTION = `query($country: Country!, $language: Language!) {
  popularTitles(country: $country, first: 10, filter: {}) { edges { node { objectType
    ... on MovieOrShow {
      content(country: $country, language: $language) { title originalReleaseYear shortDescription fullPath backdrops { backdropUrl } scoring { imdbScore imdbVotes tomatoMeter certifiedFresh } }
      offers(country: $country, platform: WEB) { monetizationType standardWebURL package { clearName } }
    } } } } }`;

async function trending() {
  const had = charts.trending;
  if (!force && had && scored(had) && now - (had.checked || 0) < 20 * HOUR) return had;
  const entries = justWatchTitles(await justWatch(QUESTION));
  if (entries.length < 5) throw new Error('JustWatch sent back too few titles');
  return { id: 'trending', name: 'Trending', source: 'JustWatch · most popular in Canada', week: new Date(now).toISOString().slice(0, 10), checked: now, entries };
}

// Trailers already found, by title and season, so each is searched for once.
const known = new Map();
for (const chart of old.charts ?? []) for (const entry of chart.entries ?? []) if (entry.trailer) known.set(`${entry.title}|${entry.season || ''}`, entry.trailer);

async function trailerFor(entry) {
  const key = `${entry.title}|${entry.season || ''}`;
  if (known.has(key)) return known.get(key);
  // A dated "season" ("Raw: November 9, 2026") is a weekly live show: no trailer, and the name
  // alone would find some other film's.
  if (/\b(19|20)\d\d\b/.test(entry.season || '')) return '';
  const need = words(entry.title).slice(0, 3);
  if (!need.length) return '';
  const season = /^season \d+$/i.test(entry.season || '') ? ` ${entry.season.toLowerCase()}` : '';
  const queries = [`${entry.title}${season} official trailer`, `${entry.title}${entry.year ? ` ${entry.year}` : ''} trailer`];
  for (const query of queries) {
    const found = await findVideo(query, need, /trailer|teaser/);
    if (found) { known.set(key, found); return found; }
  }
  return '';
}

const results = [];
for (const [name, make] of [['Netflix', netflix], ['JustWatch', trending]]) {
  try {
    results.push(await make());
  } catch (error) {
    console.error(`${name}: ${error.message}; the last list is kept.`);
    const id = name === 'Netflix' ? 'netflix' : 'trending';
    if (charts[id]) results.push(charts[id]);
  }
}
if (!results.length) {
  console.error('Neither source answered, so top10.json was left as it was.');
  process.exit(0);
}
for (const chart of results) {
  for (const entry of chart.entries) {
    if (entry.trailer || now - (entry.tried || 0) < 12 * HOUR) continue;
    entry.trailer = await trailerFor(entry);
    if (entry.trailer) delete entry.tried;
    else entry.tried = now;
    await pause(1500);
  }
}

const next = { updated: Math.floor(now / 1000), charts: results };
// Rewrite the file only when something in it changed (a check counts: the next run needs to know).
const same = (a) => JSON.stringify(a.charts ?? []);
if (old.charts && same(old) === same(next)) process.exit(0);
writeFileSync(FILE, JSON.stringify(next));
for (const chart of results) {
  console.log(`${chart.source} · ${chart.week}`);
  for (const entry of chart.entries) console.log(`  ${entry.rank}. ${entry.title}${entry.season ? ` · ${entry.season}` : ''} · ${entry.service || 'buy or rent'} · ${entry.trailer || 'no trailer'}`);
}
