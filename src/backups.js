// Backups for live HLS channels.
//
// Nothing here runs until a stream actually fails. Then the public iptv-org feed list
// maps the failed URL to every other listed feed for the same channel. Each candidate is
// tested in the browser before it is used, so a listing alone is never trusted.

const FEED_LIST = 'https://iptv-org.github.io/api/streams.json';
const PLAYS_TIMEOUT = 7000;
export const MAX_FEEDS = 6;

const isFeed = (url) => typeof url === 'string'
  && /^https:\/\//i.test(url)
  && /\.m3u8(\?|$)/i.test(url);

const heightOf = (quality) => {
  const match = String(quality || '').match(/(\d{3,4})p/i);
  return match ? Number(match[1]) : 0;
};

/** The URL -> channel and channel -> ordered feeds maps. Pure, so it can be tested. */
export function buildFeedIndex(streams) {
  const seen = new Set();
  const grouped = new Map();
  for (const item of Array.isArray(streams) ? streams : []) {
    const channel = typeof item?.channel === 'string' ? item.channel : '';
    const url = item?.url;
    if (!channel || !isFeed(url) || seen.has(url)) continue;
    seen.add(url);
    if (!grouped.has(channel)) grouped.set(channel, []);
    grouped.get(channel).push({ url, height: heightOf(item.quality) });
  }

  const channelOf = new Map();
  const feedsOf = new Map();
  for (const [channel, list] of grouped) {
    list.sort((a, b) => b.height - a.height);
    feedsOf.set(channel, list.slice(0, MAX_FEEDS).map((item) => item.url));
    // Every listed URL remembers its channel, even one past the cap, so a saved link
    // that is no longer in the top feeds can still find the working ones.
    for (const { url } of list) channelOf.set(url, channel);
  }
  return { channelOf, feedsOf };
}

let index = null;
let loading = null;
let failedAt = 0;

/** Fetches the feed list once, only when a stream has failed. */
export async function loadFeedIndex() {
  if (index) return index;
  if (loading) return loading;
  if (Date.now() - failedAt < 30000) return null;
  loading = fetch(FEED_LIST, { cache: 'no-cache', signal: AbortSignal.timeout?.(12000) })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!Array.isArray(data)) {
        failedAt = Date.now();
        return null;
      }
      index = buildFeedIndex(data);
      return index;
    })
    .catch(() => {
      failedAt = Date.now();
      return null;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Every listed feed for the channel behind this exact URL, best quality first. */
export function feedsFor(input, feedIndex = index) {
  if (!feedIndex || typeof input !== 'string') return [];
  const channel = feedIndex.channelOf.get(input);
  return channel ? feedIndex.feedsOf.get(channel) ?? [] : [];
}

/** The first listed feed that is not the one already playing and has not been tried. */
export function nextFeed(input, current, tried, feedIndex = index) {
  return feedsFor(input, feedIndex).find((url) => url !== current && !tried?.has(url)) ?? null;
}

/** The same browser check the finder uses: manifest, first variant, first segment. */
export async function plays(url) {
  try {
    const headers = { Accept: 'application/vnd.apple.mpegurl,*/*' };
    const response = await fetch(url, { cache: 'no-store', headers, signal: AbortSignal.timeout?.(PLAYS_TIMEOUT) });
    if (!response.ok) return false;
    let text = await response.text();
    if (!text.includes('#EXTM3U')) return false;
    let base = response.url || url;

    if (text.includes('#EXT-X-STREAM-INF')) {
      const variant = text.split(/\r?\n/).find((line) => line && !line.startsWith('#'));
      if (!variant) return false;
      const variantUrl = new URL(variant.trim(), base).href;
      const next = await fetch(variantUrl, { cache: 'no-store', headers, signal: AbortSignal.timeout?.(PLAYS_TIMEOUT) });
      if (!next.ok) return false;
      text = await next.text();
      base = next.url || variantUrl;
    }

    const segment = text.split(/\r?\n/).find((line) => line && !line.startsWith('#'));
    if (!segment) return false;
    const media = await fetch(new URL(segment.trim(), base).href, {
      cache: 'no-store',
      signal: AbortSignal.timeout?.(PLAYS_TIMEOUT),
    });
    return media.ok;
  } catch {
    return false;
  }
}
