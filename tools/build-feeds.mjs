// Makes feeds.json: the latest videos of the TikTok accounts in feeds/tiktok.json.
// Run by .github/workflows/guide.yml with the TV guide. TikTok's account card lists about
// a dozen of an account's newest videos, and each one plays in TikTok's own player.
//   node tools/build-feeds.mjs

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const { accounts } = JSON.parse(readFileSync(new URL('../feeds/tiktok.json', import.meta.url)));
const out = new URL('../feeds.json', import.meta.url);
const previous = existsSync(out) ? JSON.parse(readFileSync(out)) : { tiktok: {} };
const now = Math.floor(Date.now() / 1000);
const MAX_AGE = 30 * 86400;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

async function card(name) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`https://www.tiktok.com/embed/@${encodeURIComponent(name)}?lang=en-US`, {
        headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US' },
        signal: AbortSignal.timeout(20000),
      });
      const html = response.ok ? await response.text() : '';
      if (html && !/overload-protect/i.test(html)) return html;
      console.warn(`${response.status} ${name}${html ? ' (busy)' : ''}`);
    } catch (error) {
      console.warn(`${error.message} ${name}`);
    }
    await pause(4000 * attempt);
  }
  return null;
}

const result = { updated: now, tiktok: {} };
let failed = 0;
for (const name of accounts) {
  const html = await card(name);
  // A TikTok video number holds the second it was posted in its top 32 bits.
  const ids = html ? [...new Set(html.match(/"id":"(\d{18,20})"/g)?.map((match) => match.slice(6, -1)) ?? [])] : [];
  const videos = ids
    .map((id) => ({ id, at: Number(BigInt(id) >> 32n) }))
    .filter(({ at }) => at > now - MAX_AGE && at <= now + 3600)
    .sort((a, b) => b.at - a.at)
    .slice(0, 20)
    .map(({ id }) => id);
  const title = html?.match(/"nickname":"([^"]{1,80})"/)?.[1] ?? null;
  if (videos.length) {
    result.tiktok[name.toLowerCase()] = { title, videos };
  } else {
    failed++;
    // Keep the last list that worked rather than emptying the tile.
    if (previous.tiktok?.[name.toLowerCase()]) result.tiktok[name.toLowerCase()] = previous.tiktok[name.toLowerCase()];
  }
  console.log(`${String(videos.length).padStart(3)}  @${name}${html ? '' : '  (no answer)'}`);
  await pause(1500);
}

writeFileSync(out, JSON.stringify(result));
console.log(`feeds.json: ${accounts.length - failed} of ${accounts.length} accounts answered.`);
if (failed === accounts.length) process.exit(1);
