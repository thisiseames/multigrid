// Builds scores/: IMDb ratings for every film and show with at least 1,000 votes, from IMDb's
// own free files (datasets.imdbws.com), split by the first two letters of the title so the site
// fetches only small pieces. Runs weekly (scores.yml). No key or account.

import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { normTitle, shardKey } from '../src/scores.js';

const BASE = 'https://datasets.imdbws.com';
const MIN_VOTES = 1000;
const KINDS = new Set(['movie', 'tvMovie', 'tvSeries', 'tvMiniSeries']);
const OUT = new URL('../scores/', import.meta.url);

async function* rows(file) {
  const answer = await fetch(`${BASE}/${file}`);
  if (!answer.ok) throw new Error(`${file}: ${answer.status}`);
  const lines = createInterface({ input: Readable.fromWeb(answer.body).pipe(createGunzip()), crlfDelay: Infinity });
  let first = true;
  for await (const line of lines) {
    if (first) { first = false; continue; }
    yield line.split('\t');
  }
}

const ratings = new Map();
for await (const [id, rating, votes] of rows('title.ratings.tsv.gz')) {
  const count = Number(votes);
  if (count >= MIN_VOTES) ratings.set(id, [Number(rating), count]);
}
console.log(`${ratings.size} rated titles with ${MIN_VOTES}+ votes`);

const shards = new Map();
let kept = 0;
for await (const cells of rows('title.basics.tsv.gz')) {
  const [id, type, primary, original, , start] = cells;
  if (!KINDS.has(type)) continue;
  const score = ratings.get(id);
  if (!score) continue;
  const year = Number(start) || 0;
  // Both the English title and the original, when they differ, so either finds it.
  for (const title of new Set([primary, original].filter((name) => name && name !== '\\N'))) {
    const key = shardKey(title);
    if (!shards.has(key)) shards.set(key, []);
    shards.get(key).push([normTitle(title), title, year, type, id, score[0], score[1]]);
  }
  kept++;
}
if (kept < 50000) throw new Error(`Only ${kept} titles: leaving scores/ as it was.`);

mkdirSync(OUT, { recursive: true });
for (const name of readdirSync(OUT)) rmSync(new URL(name, OUT));
for (const [key, entries] of shards) writeFileSync(new URL(`${key}.json`, OUT), JSON.stringify(entries));
writeFileSync(new URL('index.json', OUT), JSON.stringify({ built: new Date().toISOString(), titles: kept, pieces: shards.size }));
console.log(`${kept} titles in ${shards.size} pieces`);
