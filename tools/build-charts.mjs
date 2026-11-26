// Makes charts.json for Today's Charts: the top 5 of seven Billboard charts, from billboard.com's
// public chart pages (no account). Each song also gets its official video, found on YouTube and
// checked by title, so it can play in a tile. Run by .github/workflows/guide.yml; the charts change
// weekly, so a few refreshes a day is plenty. If Billboard doesn't answer, the last charts stay.
//   node tools/build-charts.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { findOwnVideo, words } from './youtube-find.mjs';
import { movementOf } from './chart-rows.mjs';

const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const CHARTS = [
  { id: 'hot-100', name: 'Hot 100', kind: 'song' },
  { id: 'billboard-200', name: 'Billboard 200', kind: 'album' },
  { id: 'r-and-b-hip-hop-streaming-songs', name: 'R&B/Hip-Hop Songs', kind: 'song' },
  { id: 'r-b-hip-hop-albums', name: 'R&B/Hip-Hop Albums', kind: 'album' },
  { id: 'latin-streaming-songs', name: 'Latin Songs', kind: 'song' },
  { id: 'latin-albums', name: 'Latin Albums', kind: 'album' },
  { id: 'billboard-u-s-afrobeats-songs', name: 'Afrobeats', kind: 'song' },
];
const TOP = 10;
const OUT = new URL('../charts.json', import.meta.url);
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/** One chart's top entries: { rank, title, artist, image, last?, mark? } and the week it's for. */
async function chartOf(chart) {
  const response = await fetch(`https://www.billboard.com/charts/${chart.id}/`, { headers: { 'User-Agent': BROWSER, 'Accept-Language': 'en-US' }, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`${response.status}`);
  const { document } = parseHTML(await response.text());
  const week = clean(document.querySelector('#chart-date-picker')?.getAttribute('data-date') ?? '')
    || (clean(document.body.textContent).match(/Week of ([A-Z][a-z]+ \d{1,2}, \d{4})/)?.[1] ?? '');
  const entries = [];
  for (const row of document.querySelectorAll('ul.o-chart-results-list-row')) {
    const heading = row.querySelector('h3#title-of-a-story');
    const title = clean(heading?.textContent);
    // The artist is the label right after the title.
    let artist = '';
    for (let node = heading?.nextElementSibling; node; node = node.nextElementSibling) {
      if (node.classList?.contains('c-label')) { artist = clean(node.textContent); break; }
    }
    const img = row.querySelector('img.c-lazy-image__img');
    const image = img?.getAttribute('data-lazy-src') || img?.getAttribute('src') || '';
    if (!title) continue;
    // How it moved: last week's position, or a NEW / RE-ENTRY badge.
    entries.push({ rank: entries.length + 1, title, artist, image: /^https:\/\/charts-static\.billboard\.com\//.test(image) ? image : '', ...movementOf(row) });
    if (entries.length >= TOP) break;
  }
  if (entries.length < TOP) throw new Error(`only ${entries.length} entries`);
  return { week, entries };
}

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { charts: [] };
const charts = [];
for (const chart of CHARTS) {
  try {
    const { week, entries } = await chartOf(chart);
    for (const entry of entries) {
      // Songs play here: their official video (or official audio), checked by title and artist.
      if (chart.kind === 'song') {
        const need = [...words(entry.title).slice(0, 3), ...words(entry.artist).slice(0, 1)];
        const first = entry.artist.split(/,| & | featuring | with | x /i)[0];
        entry.video = await findOwnVideo([`${entry.artist} ${entry.title} official video`, `${first} ${entry.title}`], need, /video|audio|visuali[sz]er|lyric|video oficial/, entry.artist);
      }
    }
    charts.push({ id: chart.id, name: chart.name, kind: chart.kind, week, entries });
    console.log(`${chart.name} (${week}): ${entries.map((entry) => `${entry.rank}. ${entry.title} - ${entry.artist} (${entry.mark || `last ${entry.last ?? '?'}`})${chart.kind === 'song' && !entry.video ? ' [no video]' : ''}`).join(' | ')}`);
  } catch (error) {
    console.warn(`${chart.name}: ${error.message}; keeping the last one`);
    const kept = previous.charts.find((item) => item.id === chart.id);
    if (kept) charts.push(kept);
  }
  await pause(800);
}

if (!charts.length) {
  console.error("Billboard didn't answer, so charts.json was left as it was.");
  process.exit(0);
}
writeFileSync(OUT, JSON.stringify({ updated: Math.floor(Date.now() / 1000), charts }));
console.log(`charts.json: ${charts.length} charts.`);
