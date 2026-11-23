// Builds extras.json: trailers, season recaps, promos and cast interviews (YouTube) for the shows
// and films MULTIGRID shows: this week's Top 10s, Today's premieres and movies, and the series in
// Favorites (notes/setup-data.json). X-Ray lists them and plays them like Replays.
// Runs in guide.yml. Each title is searched again about once a week; at most PER_RUN titles a
// run, so a run stays a few minutes. Free: YouTube's public search page, no key.
// Usage: node tools/build-extras.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extrasFor, searchesFor, titleKey, videosFrom } from './extras-pick.mjs';

const OUT = 'extras.json';
const WEEK = 7 * 24 * 3600 * 1000;
const PER_RUN = Number(process.env.EXTRAS_PER_RUN || 25);
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const read = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };

/** 2, "2" or "Season 2" → 2. */
const seasonOf = (value) => Number(String(value ?? '').match(/\d+/)?.[0] || 0);

/** Every title to cover, most current first: { name, kind: 'show'|'film', season, year }. */
function titles() {
  const list = [];
  const add = (item) => { if (item.name && !list.some((other) => titleKey(other.name) === titleKey(item.name))) list.push(item); };
  for (const chart of read('top10.json')?.charts ?? []) {
    for (const entry of chart.entries ?? []) add({ name: entry.title, kind: entry.kind === 'movie' || entry.kind === 'film' ? 'film' : 'show', season: seasonOf(entry.season), year: Number(entry.year) || 0, service: entry.service || chart.name || '' });
  }
  for (const show of read('shows.json')?.items ?? []) add({ name: show.name, kind: 'show', season: seasonOf(show.season), service: show.service || '' });
  for (const film of read('movies.json')?.items ?? []) add({ name: film.title, kind: 'film', year: Number(String(film.date || '').slice(0, 4)) || 0 });
  // The owner's series favorites (names are in capitals there; YouTube search doesn't mind).
  for (const favorite of read('notes/setup-data.json')?.favorites ?? []) {
    if (/series/i.test(favorite.folder || '') && /atlantic\.bz\/watch/.test(favorite.link || '')) add({ name: favorite.name, kind: 'show', season: 0 });
  }
  return list;
}

async function search(query) {
  // A results page is ~1.5 MB; one retry after a pause covers a slow or busy answer.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const answer = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&gl=CA`, { headers: { 'User-Agent': BROWSER, 'Accept-Language': 'en-US' }, signal: AbortSignal.timeout(30000) });
      if (answer.ok) {
        const videos = videosFrom(await answer.text());
        if (videos.length) return videos;
      } else if (process.env.DEBUG) console.log('search', query, answer.status);
    } catch (error) {
      if (process.env.DEBUG) console.log('search', query, error.message);
    }
    await sleep(4000);
  }
  return [];
}

const now = Date.now();
const old = read(OUT)?.titles ?? {};
const wanted = titles();
const kept = {};
for (const title of wanted) if (old[titleKey(title.name)]) kept[titleKey(title.name)] = old[titleKey(title.name)];
// Never searched first, then the longest ago; a season change counts as new.
const due = wanted
  .filter((title) => { const entry = kept[titleKey(title.name)]; return !entry || now - entry.checked > WEEK || (title.season && entry.season !== title.season); })
  .sort((a, b) => (kept[titleKey(a.name)]?.checked ?? 0) - (kept[titleKey(b.name)]?.checked ?? 0))
  .slice(0, PER_RUN);
let found = 0;
let blocked = 0;
// A budget, so a slow YouTube never holds up the rest of the guide job (25-minute limit).
const stopAt = now + 8 * 60 * 1000;
for (const title of due) {
  if (Date.now() > stopAt) break;
  const searches = [];
  for (const { kind, query } of searchesFor(title)) {
    const videos = await search(query);
    if (!videos.length) blocked += 1;
    searches.push({ kind, videos });
    await sleep(1200);
  }
  const clips = extrasFor(title, searches);
  // A search that came back empty (YouTube busy or blocking) keeps last week's clips.
  // Searches that came back empty (YouTube slow, busy or blocking): try this title again next run.
  if (searches.filter((one) => !one.videos.length).length * 2 > searches.length) continue;
  kept[titleKey(title.name)] = { name: title.name, kind: title.kind, season: title.season || 0, checked: now, clips };
  found += clips.length;
}
const changed = JSON.stringify(kept) !== JSON.stringify(old) || !existsSync(OUT);
if (changed) writeFileSync(OUT, `${JSON.stringify({ updated: Math.floor(now / 1000), titles: kept })}\n`);
console.log(`extras: ${wanted.length} titles, searched ${due.length}, ${found} clips found, ${blocked} empty searches${changed ? '' : ' (no change)'}`);
