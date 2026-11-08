// Makes guide.json: today's and tomorrow's TV listings for the channels in guide/channels.json.
// Run by .github/workflows/guide.yml every 3 hours. Uses only free pages that need no account.
//   node tools/build-guide.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { guideKey } from '../src/guide.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const { channels } = JSON.parse(readFileSync(new URL('../guide/channels.json', import.meta.url)));
const now = Math.floor(Date.now() / 1000);
const keepFrom = now - 30 * 60;
const keepTo = now + 30 * 60 * 60;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

async function get(url, type) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: type === 'json' ? 'application/json' : 'text/html' }, signal: AbortSignal.timeout(20000) });
      if (response.ok) return type === 'json' ? response.json() : response.text();
      console.warn(`${response.status} ${url}`);
    } catch (error) {
      console.warn(`${error.message} ${url}`);
    }
    await pause(2000 * attempt);
  }
  return null;
}

const ymd = (date, joiner) => [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join(joiner);

/* Sky (UK): one request covers up to 20 channels for one day. */
async function sky(list) {
  const out = new Map();
  const days = [0, 1].map((add) => ymd(new Date((now + add * 86400) * 1000), ''));
  for (let i = 0; i < list.length; i += 20) {
    const batch = list.slice(i, i + 20);
    for (const day of days) {
      const data = await get(`https://awk.epgsky.com/hawk/linear/schedule/${day}/${batch.map((c) => c.sky).join(',')}`, 'json');
      for (const service of data?.schedule ?? []) {
        const rows = out.get(Number(service.sid)) ?? [];
        for (const event of service.events ?? []) {
          if (Number.isFinite(event.st) && Number.isFinite(event.d) && event.t) rows.push([event.st, event.st + event.d, event.t]);
        }
        out.set(Number(service.sid), rows);
      }
      await pause(500);
    }
  }
  return out;
}

/* TV Passport (US and Canada): one page per channel per day, in Eastern time, 6:00 am to 6:00 am. */
function easternToEpoch(text) {
  const [date, time] = text.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
  const seenAs = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((guess + (guess - seenAs)) / 1000);
}

const decode = (text) => text.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function tvpassportRows(html) {
  const rows = [];
  for (const match of html.matchAll(/<div[^>]*data-listDateTime="([^"]+)"[^>]*>/g)) {
    const tag = match[0];
    const field = (name) => decode(tag.match(new RegExp(`data-${name}="([^"]*)"`))?.[1] ?? '');
    const start = easternToEpoch(match[1]);
    const minutes = Number(field('duration'));
    const show = field('showName');
    const episode = field('episodeTitle');
    // Movie channels list every film as "Movie" and put its name in the episode title.
    const title = (show === 'Movie' || show === 'Movies') && episode ? episode : show;
    if (title && Number.isFinite(start) && minutes > 0) rows.push([start, start + minutes * 60, title]);
  }
  return rows;
}

async function tvpassport(channel) {
  // The day page that holds right now starts at 6:00 am Eastern, so before 6 it's yesterday's.
  const first = new Date((now - 6 * 3600) * 1000 - 5 * 3600 * 1000);
  const days = [0, 1].map((add) => ymd(new Date(first.getTime() + add * 86400000), '-'));
  const rows = [];
  for (const day of days) {
    const html = await get(`https://www.tvpassport.com/tv-listings/stations/${channel.tvpassport}/${day}`, 'text');
    if (html) rows.push(...tvpassportRows(html));
    await pause(600);
  }
  return rows;
}

const result = { updated: now, channels: {} };
const skyRows = await sky(channels.filter((c) => c.sky));
let empty = 0;
for (const channel of channels) {
  const rows = channel.sky ? skyRows.get(channel.sky) ?? [] : await tvpassport(channel);
  const seen = new Set();
  const kept = rows
    .filter(([start, end]) => end > keepFrom && start < keepTo)
    .sort((a, b) => a[0] - b[0])
    .filter(([start]) => !seen.has(start) && seen.add(start));
  if (!kept.length) empty++;
  for (const name of channel.names) result.channels[guideKey(name)] = kept;
  console.log(`${String(kept.length).padStart(3)}  ${channel.names[0]}`);
}

// A run where most sources failed keeps the last good guide instead of blanking it.
if (empty > channels.length / 2) {
  console.error(`${empty} of ${channels.length} channels came back empty, so guide.json was left as it was.`);
  process.exit(1);
}
writeFileSync(new URL('../guide.json', import.meta.url), JSON.stringify(result));
console.log(`guide.json: ${channels.length - empty} of ${channels.length} channels have listings.`);
