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

// Rio posts match clips as Shorts, which the uploads playlist leaves out.
const CHANNEL_FEEDS = new Set(['UCPAiS32go3-GwTO0kmlVX7g']);
const uploadsOf = async (channelId) => {
  const url = CHANNEL_FEEDS.has(channelId)
    ? `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    : `https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${channelId.slice(2)}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (response.ok) return parseFeed(await response.text());
    } catch { /* try once more */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
};

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
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }
  const previousBySource = new Map();
  for (const video of previous.videos ?? []) {
    if (!previousBySource.has(video.source)) previousBySource.set(video.source, []);
    previousBySource.get(video.source).push(video);
  }
  const videos = [];
  const failed = [];
  for (const [channel, source] of Object.entries(MATCHDAY_FANS)) {
    const uploads = await uploadsOf(channel);
    if (!uploads) { failed.push(source); continue; }
    const fresh = uploads.filter((item) => now - item.published < 2 * DAY && manUtd.test(item.title));
    console.log(`${source}: ${uploads.length} uploads, ${fresh.length} Man Utd`);
    for (const upload of fresh) {
      if (videos.some((video) => video.id === upload.id)) continue;
      videos.push({ id: upload.id, title: upload.title, published: upload.published, source });
    }
  }
  // A channel's feed failing must not make that channel vanish from the row.
  for (const source of failed) {
    const kept = (previousBySource.get(source) ?? []).filter((video) => now - video.published < 2 * DAY);
    console.log(`${source}: feed unavailable, keeping ${kept.length} previous`);
    for (const video of kept) {
      if (!videos.some((item) => item.id === video.id)) videos.push(video);
    }
  }
  videos.sort((a, b) => b.published - a.published);
  if (!videos.length) return;
  const next = `${JSON.stringify({ updated: now, videos }, null, 1)}\n`;
  // Don't create a commit every five minutes when nothing changed.
  if (JSON.stringify(previous.videos ?? []) === JSON.stringify(videos)) return;
  fs.writeFileSync(OUT, next);
  console.log(`Matchday reactions: ${videos.length} videos from ${new Set(videos.map((video) => video.source)).size} channels.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error); process.exitCode = 0; });
