// Daddy Live's public live-event API: keyless JSON, CORS open, refreshed about once a
// minute. It only lists events that are live right now, each with one or more embed links.

const API = 'https://daddylive.app/api/events';
const CACHE_MS = 60_000;

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Event names sometimes start with a sport emoji; keep the words and the closing brackets. */
const eventText = (value) => clean(value).replace(/^[^\p{L}\p{N}]+/u, '').trim();

/** Category labels sometimes have an emoji on either side ("🏀 Basketball", "Motorsport 🏎️"). */
const categoryText = (value) => clean(value)
  .replace(/^[^\p{L}\p{N}]+/u, '')
  .replace(/[^\p{L}\p{N}]+$/u, '')
  .trim();

const keyFor = (value) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Only Daddy Live's own player page is accepted, never a link the API might be tricked into returning. */
function playerUrl(raw) {
  const text = clean(raw);
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || url.hostname.toLocaleLowerCase() !== 'daddylive.app') return '';
    if (url.pathname !== '/player/embed.php') return '';
    return url.href;
  } catch {
    return '';
  }
}

const linkName = (raw, index) => {
  const text = clean(raw).replace(/^link\s*-\s*(\d+)$/i, 'Link $1');
  return text || `Link ${index + 1}`;
};

/**
 * Flattens the API's category groups into one list. The same event can appear under
 * "Live Events" and a sport category; merge those, keep every distinct link, and keep
 * the first category as the display one unless a more specific category exists.
 */
export function normalizeDaddyLive(data) {
  const events = new Map();
  let order = 0;
  for (const [rawCategory, list] of Object.entries(data?.categories ?? {})) {
    if (!Array.isArray(list)) continue;
    const category = categoryText(rawCategory) || 'Live Events';
    for (const entry of list) {
      const name = eventText(entry?.event);
      if (!name) continue;
      const channels = [];
      const seen = new Set();
      for (const channel of Array.isArray(entry?.channels) ? entry.channels : []) {
        const url = playerUrl(channel?.url);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        channels.push({
          name: linkName(channel?.channel_name, channels.length),
          url,
          source: clean(entry?.source),
        });
      }
      if (!channels.length) continue;
      const key = keyFor(name);
      if (!key) continue;
      let event = events.get(key);
      if (!event) {
        event = {
          name,
          order: order++,
          categories: new Map(),
          channels: [],
          sources: new Map(),
          time: clean(entry?.time),
        };
        events.set(key, event);
      }
      const categoryKey = keyFor(category);
      if (!event.categories.has(categoryKey)) event.categories.set(categoryKey, category);
      if (entry?.source) {
        const source = clean(entry.source);
        const sourceKey = keyFor(source);
        if (source && !event.sources.has(sourceKey)) event.sources.set(sourceKey, source);
      }
      for (const channel of channels) {
        if (!event.channels.some((item) => item.url === channel.url)) event.channels.push(channel);
      }
    }
  }
  return [...events.values()]
    .map((event) => {
      const categories = [...event.categories.values()]
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      const category = categories.find((name) => keyFor(name) !== 'live events')
        || categories[0]
        || 'Live Events';
      const sources = [...event.sources.values()];
      return {
        name: event.name,
        category,
        categories,
        source: sources[0] || '',
        sources,
        channels: event.channels,
        input: event.channels[0].url,
        live: true,
        time: event.time,
        order: event.order,
      };
    })
    .sort((a, b) => a.order - b.order);
}

let cache = null;
let cachedAt = 0;
let pending = null;

/** The current Daddy Live events, or null when the service is quiet. One request at a time. */
export function loadDaddyLive(force = false) {
  if (!force && cache && Date.now() - cachedAt < CACHE_MS) return Promise.resolve(cache);
  if (pending) return pending;
  pending = fetch(API, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout?.(8000),
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data || typeof data !== 'object' || !data.categories || typeof data.categories !== 'object') return null;
      cache = normalizeDaddyLive(data);
      cachedAt = Date.now();
      return cache;
    })
    .catch(() => null)
    .finally(() => { pending = null; });
  return pending;
}
