// A small, fast reaction feed for Matchday. The Reader job is too slow (about 25 minutes) for
// post-match fan videos, so this runs every 5 minutes while Man Utd are playing or just finished,
// reads only the fan channels' public uploads, and writes matchday-reactions.json.
//
// The app merges these with the official club/broadcaster videos from highlights.json. No API key.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { MATCHDAY_FANS, parseFeed } from './build-highlights.mjs';

const OUT = new URL('../matchday-reactions.json', import.meta.url);
const DAY = 86400000;
const WINDOW_BEFORE = 2 * 3600000;
const WINDOW_AFTER = 8 * 3600000;

const uploadsOf = (channelId) => fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${channelId.slice(2)}`, {
  signal: AbortSignal.timeout(12000),
})
  .then((response) => (response.ok ? response.text() : ''))
  .then(parseFeed)
  .catch(() => []);

/** Only run near a Man Utd game; the workflow can be scheduled often without hammering YouTube. */
async function nearMatch(now) {
  const answer = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/360/schedule', { signal: AbortSignal.timeout(12000) })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  return (answer?.events ?? []).some((event) => {
    const start = Date.parse(event.date);
    if (!Number.isFinite(start)) return false;
    return now >= start - WINDOW_BEFORE && now <= start + WINDOW_AFTER;
  });
}

async function main() {
  const now = Date.now();
  if (!(await nearMatch(now))) return;
  const manUtd = /\bman(chester)?\.?\s*(utd|united)\b|\bunited\b|\bold trafford\b|\bpochettino\b|\bred devils\b|\bcarrick\b|\bINEOS\b|\bglazers?\b/i;
  const videos = [];
  for (const [channel, source] of Object.entries(MATCHDAY_FANS)) {
    for (const upload of (await uploadsOf(channel)).filter((item) => now - item.published < 2 * DAY && manUtd.test(item.title))) {
      if (videos.some((video) => video.id === upload.id)) continue;
      videos.push({ id: upload.id, title: upload.title, published: upload.published, source });
    }
  }
  videos.sort((a, b) => b.published - a.published);
  // A YouTube hiccup must not wipe the last good reaction list.
  if (!videos.length) return;
  let previous = '';
  try { previous = fs.readFileSync(OUT, 'utf8'); } catch { /* first run */ }
  const next = `${JSON.stringify({ updated: now, videos }, null, 1)}\n`;
  // Don't create a commit every five minutes when nothing changed.
  try {
    const old = JSON.parse(previous || '{}');
    if (JSON.stringify(old.videos ?? []) === JSON.stringify(videos)) return;
  } catch { /* write a fresh file */ }
  fs.writeFileSync(OUT, next);
  console.log(`Matchday reactions: ${videos.length} videos from ${new Set(videos.map((video) => video.source)).size} channels.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error); process.exitCode = 0; });
