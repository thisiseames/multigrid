// Makes catalog.json for The Multigrid Ten: popular films and shows in Canada, with genres,
// pictures and scores. Six genres plus the overall list, deduped. JustWatch's own public
// question (no key; unofficial, so if it stops answering the old file is kept).
// Run daily by .github/workflows/catalog.yml.   node tools/build-catalog.mjs

import { writeFileSync } from 'node:fs';
import { catalogTitles, GENRE_QUERIES, mergeCatalog } from './catalog-rows.mjs';

const FILE = new URL('../catalog.json', import.meta.url);
const JUSTWATCH = 'https://apis.justwatch.com/graphql';
const UA = 'MULTIGRID-catalog/1.0 (personal TV app; github.com/thisiseames/multigrid)';
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

const question = (filter) => `query($country: Country!, $language: Language!) {
  popularTitles(country: $country, first: 100, filter: { ${filter} }) { edges { node { objectType
    ... on MovieOrShow {
      content(country: $country, language: $language) {
        title
        originalReleaseYear
        shortDescription
        genres { shortName }
        backdrops { backdropUrl }
        scoring { imdbScore imdbVotes tomatoMeter certifiedFresh }
      }
    }
  } } }
}`;

async function ask(filter) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(JUSTWATCH, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: question(filter), variables: { country: 'CA', language: 'en' } }),
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return response.json();
      console.warn(`JustWatch answered ${response.status}`);
    } catch (error) {
      console.warn(`${error.message}`);
    }
    await pause(1500 * attempt);
  }
  return null;
}

const entries = [];
let answered = 0;
const queries = [{ name: 'Popular', filter: '' }, ...GENRE_QUERIES.map((genre) => ({ name: genre.name, filter: `genres: ["${genre.code}"]` }))];
for (const query of queries) {
  const answer = await ask(query.filter);
  const found = catalogTitles(answer);
  if (found.length) answered += 1;
  console.log(`${query.name}: ${found.length}`);
  entries.push(...found);
  await pause(400);
}

const titles = mergeCatalog(entries);
if (answered < 4 || titles.length < 200) {
  console.error(`Only ${titles.length} titles from ${answered} answers: catalog.json was left as it was.`);
  process.exit(0);
}

writeFileSync(FILE, JSON.stringify({ updated: Math.floor(Date.now() / 1000), titles }));
console.log(`${titles.length} titles from ${answered} answers written to catalog.json`);
