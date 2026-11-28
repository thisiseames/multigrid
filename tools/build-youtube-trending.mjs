// Makes youtube-trending.json for the Home row. YouTube's official Data API supplies the US
// mostPopular chart for each chosen category. The API key lives in the GitHub secret
// YOUTUBE_API_KEY. Long videos come first; thin categories are filled with their longest
// one-to-three-minute clips, and live/upcoming items are always left out. A category that
// fails keeps its previous rows; if everything fails the old file stays.
// Run by .github/workflows/youtube-trending.yml.
//   YOUTUBE_API_KEY=... node tools/build-youtube-trending.mjs

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { YOUTUBE_CATEGORIES, categoryRows } from './youtube-trending-rows.mjs';

const FILE = new URL('../youtube-trending.json', import.meta.url);
const ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos';
const KEY = String(process.env.YOUTUBE_API_KEY || '').trim();
const now = Date.now();
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

if (!KEY) {
  console.error('YOUTUBE_API_KEY is not set.');
  process.exit(1);
}

let old = {};
try { old = JSON.parse(readFileSync(FILE, 'utf8')); } catch { /* first run */ }
const kept = new Map((old.categories ?? []).map((category) => [category.id, category]));

async function chart(category) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('part', 'snippet,statistics,contentDetails');
  url.searchParams.set('chart', 'mostPopular');
  url.searchParams.set('regionCode', 'US');
  url.searchParams.set('maxResults', '50');
  url.searchParams.set('key', KEY);
  if (category.api) url.searchParams.set('videoCategoryId', category.api);
  const response = await fetch(url, { signal: AbortSignal.timeout?.(25000) });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`YouTube answered ${response.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
  }
  const answer = await response.json();
  const rows = categoryRows(answer.items?.length ? answer.items : []);
  if (!rows.length) throw new Error('no usable videos');
  return rows;
}

const categories = [];
for (const category of YOUTUBE_CATEGORIES) {
  try {
    const entries = await chart(category);
    categories.push({ id: category.id, name: category.name, entries });
    console.log(`${category.name}: ${entries.length} videos, first ${entries[0].title}`);
  } catch (error) {
    console.warn(`${category.name}: ${error.message}; keeping the last copy.`);
    const previous = kept.get(category.id);
    if (previous?.entries?.length) categories.push(previous);
  }
  await pause(250);
}

if (!categories.length) {
  console.error('No category answered, so youtube-trending.json was left as it was.');
  process.exit(0);
}

const next = { updated: Math.floor(now / 1000), region: 'US', categories };
if (JSON.stringify(old.categories ?? []) === JSON.stringify(categories)) {
  console.log(`youtube-trending.json: unchanged (${categories.length} categories).`);
  process.exit(0);
}
writeFileSync(FILE, JSON.stringify(next));
console.log(`youtube-trending.json: ${categories.length} categories, ${categories.reduce((sum, category) => sum + category.entries.length, 0)} videos.`);
