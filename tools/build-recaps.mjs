// Builds recaps.json: one season recap from YouTube for every Series favourite, with the season
// worked out from TVmaze. Runs in guide.yml; each show is checked about weekly. Free: TVmaze and
// YouTube's public search page, no key. Job-owned output; never hand-edit it.
// Usage: node tools/build-recaps.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { titleKey, videosFrom } from './extras-pick.mjs';
import { pickRecap, recapQueries, seasonPlan } from './recaps-pick.mjs';

const OUT = 'recaps.json';
const WEEK = 7 * 24 * 3600 * 1000;
const PER_RUN = Number(process.env.RECAPS_PER_RUN || 48);
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const read = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const favorites = () => (read('notes/setup-data.json')?.favorites ?? [])
  .filter((item) => String(item.folder || '').toUpperCase() === 'SERIES' && /atlantic\.bz\/watch/.test(item.link || ''))
  .map((item) => ({ name: String(item.name || '').trim(), input: item.link }))
  .filter((item) => item.name);

async function lookup(name) {
  const url = `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(name)}&embed[]=nextepisode&embed[]=previousepisode`;
  try {
    const answer = await fetch(url, { headers: { 'User-Agent': BROWSER }, signal: AbortSignal.timeout?.(15000) });
    if (answer.status === 404) return null;
    if (!answer.ok) return null;
    const show = await answer.json();
    const prev = show._embedded?.previousepisode;
    const next = show._embedded?.nextepisode;
    return {
      name: show.name || name,
      status: show.status || '',
      service: show.network?.name || show.webChannel?.name || '',
      prevSeason: Number(prev?.season) || 0,
      nextSeason: Number(next?.season) || 0,
    };
  } catch {
    return null;
  }
}

/** YouTube results, or null when the page did not answer; [] means it answered with no results. */
async function search(query) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const answer = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&gl=CA`, {
        headers: { 'User-Agent': BROWSER, 'Accept-Language': 'en-US' },
        signal: AbortSignal.timeout?.(30000),
      });
      if (answer.ok) return videosFrom(await answer.text());
    } catch { /* retry once */ }
    await sleep(3500);
  }
  return null;
}

const now = Date.now();
const old = read(OUT)?.shows ?? {};
const wanted = favorites();
const due = wanted
  .filter((item) => {
    const known = old[titleKey(item.name)];
    return !known || now - (Number(known.checked) || 0) > WEEK;
  })
  .sort((a, b) => (Number(old[titleKey(a.name)]?.checked) || 0) - (Number(old[titleKey(b.name)]?.checked) || 0))
  .slice(0, PER_RUN);
const shows = { ...old };
const stopAt = now + 8 * 60 * 1000;
let checked = 0;
let found = 0;
let missing = 0;
for (const item of due) {
  if (Date.now() > stopAt) break;
  const show = await lookup(item.name);
  await sleep(180);
  if (!show) {
    console.log(`recaps: no TVmaze match for ${item.name}; next run`);
    continue;
  }
  const plan = seasonPlan(show);
  if (!plan.latest) {
    shows[titleKey(item.name)] = { name: show.name || item.name, latest: 0, next: plan.next, checked: now, clip: null };
    checked += 1;
    missing += 1;
    continue;
  }
  let clip = null;
  let blocked = false;
  for (const query of recapQueries({ name: show.name || item.name, latest: plan.latest, next: plan.next })) {
    if (Date.now() > stopAt) { blocked = true; break; }
    const answer = await search(query);
    await sleep(1000);
    if (answer === null) { blocked = true; continue; }
    clip = pickRecap(answer, { name: show.name || item.name, latest: plan.latest, next: plan.next, service: show.service, status: show.status });
    if (clip) break;
  }
  const previous = old[titleKey(item.name)];
  if (!clip && blocked && previous?.clip) {
    shows[titleKey(item.name)] = previous;
    continue;
  }
  shows[titleKey(item.name)] = {
    name: show.name || item.name,
    latest: plan.latest,
    next: plan.next,
    season: clip?.recapSeason || plan.latest,
    series: Boolean(clip?.series),
    checked: now,
    clip: clip ? { id: clip.id, title: clip.title, channel: clip.channel, seconds: clip.seconds } : (previous?.clip ?? null),
  };
  checked += 1;
  if (shows[titleKey(item.name)].clip) found += 1;
  else missing += 1;
}
const changed = JSON.stringify({ ...old, ...shows }) !== JSON.stringify(old) || !existsSync(OUT);
if (changed) writeFileSync(OUT, `${JSON.stringify({ updated: Math.floor(now / 1000), shows })}\n`);
console.log(`recaps: ${wanted.length} series, checked ${checked}, ${found} with a recap, ${missing} missing${changed ? '' : ' (no change)'}`);
