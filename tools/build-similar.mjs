// Builds similar.json: up to five "More like this" rows for every Series favourite, from
// JustWatch's public GraphQL API. Runs in guide.yml; each show is checked about weekly.
// Free, no key. Job-owned output; never hand-edit it.
// Usage: node tools/build-similar.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { titleKey } from '../src/for-you.js';
import { parseSimilar } from '../src/similar.js';

const OUT = 'similar.json';
const WEEK = 7 * 24 * 3600 * 1000;
const PER_RUN = Number(process.env.SIMILAR_PER_RUN || 48);
const UA = 'MULTIGRID-similar/1.0 (personal TV app; github.com/thisiseames/multigrid)';
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const read = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };

const QUERY = `query($country: Country!, $language: Language!, $query: String!) {
  searchTitles(source: "multigrid", country: $country, first: 1, filter: { searchQuery: $query, objectTypes: [SHOW] }) {
    edges { node { ... on MovieOrShow {
      content(country: $country, language: $language) { title genres { shortName } }
      similarTitles(country: $country, limit: 10) {
        objectType
        content(country: $country, language: $language) {
          title
          originalReleaseYear
          shortDescription
          backdrops { backdropUrl }
          genres { shortName }
          scoring { imdbScore imdbVotes tomatoMeter certifiedFresh }
        }
      }
    } } }
  }
}`;

async function justWatch(name) {
  const response = await fetch('https://apis.justwatch.com/graphql', {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { country: 'CA', language: 'en', query: name } }),
    signal: AbortSignal.timeout?.(20000),
  });
  if (!response.ok) throw new Error(`JustWatch answered ${response.status}`);
  const data = await response.json();
  const node = data?.data?.searchTitles?.edges?.[0]?.node;
  if (!node) return null;
  const genres = (node.content?.genres ?? []).map((genre) => genre?.shortName).filter(Boolean);
  const items = parseSimilar(node.similarTitles, { title: name, kind: 'show', seedGenres: genres, limit: 5 });
  return { name: node.content?.title || name, items };
}

const favorites = () => (read('notes/setup-data.json')?.favorites ?? [])
  .filter((item) => String(item.folder || '').toUpperCase() === 'SERIES' && /atlantic\.bz\/watch/.test(item.link || ''))
  .map((item) => ({ name: String(item.name || '').trim(), input: item.link }))
  .filter((item) => item.name);

const now = Date.now();
const old = read(OUT)?.shows ?? {};
const shows = { ...old };
const wanted = favorites();
const due = wanted
  .filter((item) => {
    const known = old[titleKey(item.name)];
    return !known || now - (Number(known.checked) || 0) > WEEK;
  })
  .sort((a, b) => (Number(old[titleKey(a.name)]?.checked) || 0) - (Number(old[titleKey(b.name)]?.checked) || 0))
  .slice(0, PER_RUN);
const stopAt = now + 8 * 60 * 1000;
let checked = 0;
let found = 0;
for (const item of due) {
  if (Date.now() > stopAt) break;
  try {
    const answer = await justWatch(item.name);
    if (!answer) {
      console.log(`similar: no JustWatch match for ${item.name}; next run`);
      continue;
    }
    const key = titleKey(item.name);
    shows[key] = { name: answer.name, checked: now, items: answer.items };
    checked += 1;
    if (answer.items.length) found += 1;
    else console.log(`similar: ${item.name} had no neighbours that passed the filter`);
  } catch (error) {
    console.log(`similar: ${item.name} failed (${String(error?.message || error).slice(0, 80)}); keeping the old entry`);
    if (old[titleKey(item.name)]) shows[titleKey(item.name)] = old[titleKey(item.name)];
  }
  await sleep(250);
}
const next = { updated: Math.floor(now / 1000), shows };
const changed = JSON.stringify(next) !== JSON.stringify(read(OUT)) || !existsSync(OUT);
if (changed) writeFileSync(OUT, `${JSON.stringify(next)}\n`);
console.log(`similar: ${wanted.length} series, checked ${checked}, ${found} with rows, ${wanted.length - Object.keys(shows).length} still missing${changed ? '' : ' (no change)'}`);
