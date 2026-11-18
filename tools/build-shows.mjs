// Makes shows.json for Today's "Premieres this week": the biggest new series and new seasons
// starting from 7 days ago to 7 days ahead, on US, UK and Canadian channels and streaming
// services. From TVmaze's public schedules (no key); "biggest" is TVmaze's own popularity score.
// Each gets its trailer, found on YouTube and checked by title. Run by .github/workflows/guide.yml.
//   node tools/build-shows.mjs

import { writeFileSync } from 'node:fs';
import { findVideo } from './youtube-find.mjs';

const UA = 'MULTIGRID-shows/1.0 (personal TV app; github.com/thisiseames/multigrid)';
const SHOWN = 8;
const COUNTRIES = ['US', 'GB', 'CA'];
// Daily shows start a "season" all the time; those aren't premieres anyone waits for.
const SKIP_TYPES = new Set(['News', 'Talk Show', 'Sports', 'Panel Show', 'Award Show']);
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

async function getJSON(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      if (response.ok) return response.json();
      if (response.status === 404) return [];
      // TVmaze allows about 20 asks every 10 seconds; on "too many", wait and try again.
      await pause(response.status === 429 ? 5000 * attempt : 1500 * attempt);
    } catch {
      await pause(1500 * attempt);
    }
  }
  return null;
}

const iso = (date) => date.toISOString().slice(0, 10);
const days = [];
for (let offset = -7; offset <= 7; offset++) days.push(iso(new Date(Date.now() + offset * 86400000)));

// Every first episode of a season in the fortnight, from streaming services and from each country's channels.
const firsts = new Map(); // show id -> episode
let answered = 0;
for (const day of days) {
  const lists = [await getJSON(`https://api.tvmaze.com/schedule/web?date=${day}`)];
  for (const country of COUNTRIES) lists.push(await getJSON(`https://api.tvmaze.com/schedule?country=${country}&date=${day}`));
  for (const list of lists) {
    if (!list) continue;
    answered += 1;
    for (const episode of list) {
      const show = episode._embedded?.show ?? episode.show;
      if (!show || episode.number !== 1 || show.language !== 'English' || SKIP_TYPES.has(show.type)) continue;
      const service = show.webChannel ?? show.network;
      // Streaming services with no country (Netflix, Prime Video) are worldwide; others must be US, UK or Canadian.
      const country = service?.country?.code;
      if (country && !COUNTRIES.includes(country)) continue;
      if (!firsts.has(show.id) || episode.airdate < firsts.get(show.id).airdate) firsts.set(show.id, { ...episode, show });
    }
  }
  await pause(400);
}
if (!answered || !firsts.size) {
  console.error("TVmaze didn't answer (or had no premieres), so shows.json was left as it was.");
  process.exit(0);
}

const top = [...firsts.values()].sort((a, b) => (b.show.weight ?? 0) - (a.show.weight ?? 0)).slice(0, SHOWN);
const items = [];
for (const episode of top) {
  const { show } = episode;
  // Seasons numbered by year (2026) just say "New season".
  const isNew = episode.season === 1;
  const season = isNew ? 0 : episode.season < 1900 ? episode.season : -1;
  const name = show.name;
  const queries = isNew ? [`${name} official trailer`, `${name} trailer`] : [`${name} season ${season > 0 ? season : ''} official trailer`, `${name} season ${season > 0 ? season : ''} trailer`];
  const need = name.toLowerCase().normalize('NFKD').replace(/[^\w\s]/g, ' ').split(/\s+/).filter((word) => word.length > 1 && !['the', 'and'].includes(word)).slice(0, 3);
  let trailer = '';
  for (const query of queries) {
    trailer = await findVideo(query, need, /trailer|teaser/);
    if (trailer) break;
  }
  items.push({
    name,
    date: episode.airdate,
    service: (show.webChannel ?? show.network)?.name ?? '',
    season,
    image: show.image?.medium ?? '',
    url: show.url,
    trailer,
  });
  await pause(300);
}

writeFileSync(new URL('../shows.json', import.meta.url), JSON.stringify({ updated: Math.floor(Date.now() / 1000), from: days[0], to: days.at(-1), items }));
console.log(`shows.json: ${items.length} of ${firsts.size} premieres this fortnight.`);
for (const item of items) console.log(`  ${item.date} · ${item.service} · ${item.name} · ${item.season === 0 ? 'New series' : item.season > 0 ? `Season ${item.season}` : 'New season'} · ${item.trailer || 'no trailer'}`);
