// Builds live-channels.json: English-language channels from the US, Canada, Australia,
// Ireland, New Zealand and the UK that actually pass a browser-equivalent play test.
// A channel is kept only when its HLS manifest and first segment both answer and allow
// CORS, because without that hls.js cannot play it inside MULTIGRID.
//   node tools/build-channels.mjs
// Run by .github/workflows/channels.yml. If no channels pass, the last catalog stays.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseChannelList } from '../src/channels.js';

const COUNTRIES = [
  { code: 'us', name: 'US', url: 'https://iptv-org.github.io/iptv/countries/us.m3u' },
  { code: 'ca', name: 'Canada', url: 'https://iptv-org.github.io/iptv/countries/ca.m3u' },
  { code: 'au', name: 'Australia', url: 'https://iptv-org.github.io/iptv/countries/au.m3u' },
  { code: 'ie', name: 'Ireland', url: 'https://iptv-org.github.io/iptv/countries/ie.m3u' },
  { code: 'nz', name: 'New Zealand', url: 'https://iptv-org.github.io/iptv/countries/nz.m3u' },
  { code: 'gb', name: 'UK', url: 'https://iptv-org.github.io/iptv/countries/gb.m3u' },
];
const OUT = new URL('../live-channels.json', import.meta.url);
const COUNTRY_ORDER = ['US', 'Canada', 'Australia', 'Ireland', 'New Zealand', 'UK'];
const CATEGORY_ORDER = ['News', 'Sports', 'Entertainment', 'Movies', 'Kids', 'Documentary', 'Music', 'General'];
const CONCURRENCY = 14;
const TIMEOUT = 8000;

const NON_ENGLISH = /\b(french|fran[cç]ais|spanish|espa[nñ]ol|latino|arabic|عربي|chinese|mandarin|cantonese|korean|hindi|urdu|portuguese|portugu[eê]s|german|deutsch|italian|italiano|russian|turkish|persian|farsi|vietnamese|tagalog|filipino|polish|greek|hebrew|japanese|thai|indonesian|malay|bengali|punjabi|tamil|telugu|gujarati|marathi|somali|swahili|amharic|yoruba|igbo|hausa|zulu|afrikaans|dutch|swedish|norwegian|danish|finnish|czech|slovak|hungarian|romanian|bulgarian|serbian|croatian|bosnian|albanian|ukrainian|belarusian|lithuanian|latvian|estonian|armenian|georgian|azerbaijani|kazakh|uzbek|mongolian|khmer|lao|burmese|nepali|sinhala|pashto|kurdish)\b/i;

const CATEGORIES = [
  [/^news\b/i, 'News'],
  [/^sports?\b/i, 'Sports'],
  [/entertain|series|culture|comedy/i, 'Entertainment'],
  [/movie|cinema/i, 'Movies'],
  [/kid|child|animation/i, 'Kids'],
  [/documentary/i, 'Documentary'],
  [/music/i, 'Music'],
  [/general/i, 'General'],
];
const categoryOf = (group) => CATEGORIES.find(([match]) => match.test(String(group || '')))?.[1] || '';

const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const abs = (base, value) => { try { return new URL(value, base).href; } catch { return ''; } };

/** The HLS manifest, the first variant and the first segment must all answer with CORS. */
async function plays(url) {
  try {
    const headers = { Origin: 'https://thisiseames.github.io', Accept: 'application/vnd.apple.mpegurl,*/*' };
    const first = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
    if (!first.ok || !first.headers.get('access-control-allow-origin')) return false;
    let text = await first.text();
    if (!text.includes('#EXTM3U')) return false;
    let base = first.url || url;

    if (text.includes('#EXT-X-STREAM-INF')) {
      const variant = text.split(/\r?\n/).find((line) => line && !line.startsWith('#'));
      if (!variant) return false;
      const variantUrl = abs(base, variant.trim());
      const next = await fetch(variantUrl, { headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
      if (!next.ok || !next.headers.get('access-control-allow-origin')) return false;
      text = await next.text();
      base = next.url || variantUrl;
    }

    const segment = text.split(/\r?\n/).find((line) => line && !line.startsWith('#'));
    if (!segment) return false;
    const segmentUrl = abs(base, segment.trim());
    const media = await fetch(segmentUrl, {
      headers: { Origin: 'https://thisiseames.github.io', Range: 'bytes=0-1' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT),
    });
    return media.ok && Boolean(media.headers.get('access-control-allow-origin'));
  } catch {
    return false;
  }
}

async function mapLimit(items, limit, work) {
  const out = new Array(items.length);
  let at = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (at < items.length) {
      const index = at++;
      out[index] = await work(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { channels: [] };
const seen = new Set();
const candidates = [];
for (const country of COUNTRIES) {
  try {
    const response = await fetch(country.url, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(String(response.status));
    const list = parseChannelList(await response.text());
    for (const item of list) {
      const category = categoryOf(item.group);
      if (!category) continue;
      if (!/\.m3u8(\?|$)/i.test(item.url)) continue;
      if (NON_ENGLISH.test(item.name)) continue;
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      candidates.push({ ...item, country: country.name, countryCode: country.code, category });
    }
    console.log(`${country.name}: ${list.length} listed, ${candidates.length} candidates so far`);
  } catch (error) {
    console.warn(`${country.name}: ${error.message}`);
  }
}

console.log(`probe ${candidates.length} channels…`);
let done = 0;
const checked = await mapLimit(candidates, CONCURRENCY, async (item) => {
  const ok = await plays(item.url);
  done += 1;
  if (done % 50 === 0) console.log(`  ${done}/${candidates.length}`);
  return ok ? { name: item.name, url: item.url, logo: item.logo || '', group: item.group || '', category: item.category, country: item.country, countryCode: item.countryCode } : null;
});
const channels = checked.filter(Boolean).sort((a, b) => (COUNTRY_ORDER.indexOf(a.country) - COUNTRY_ORDER.indexOf(b.country)) || (CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)) || a.name.localeCompare(b.name));

if (!channels.length) {
  console.error('No channels passed; live-channels.json was left as it was.');
  process.exit(0);
}
writeFileSync(OUT, JSON.stringify({ updated: Math.floor(Date.now() / 1000), channels }));
console.log(`live-channels.json: ${channels.length} working channels out of ${candidates.length}.`);
for (const country of COUNTRIES) {
  const count = channels.filter((item) => item.country === country.name).length;
  if (count) console.log(`  ${country.name}: ${count}`);
}
