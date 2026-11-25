// Matchora's public sports schedule: free, keyless, CORS-open. Each match has a clean
// player-only embed URL; its channels and scores are metadata for the card.

const API = 'https://matchora.to/api/v1/schedule?watchable=1';
const CACHE_MS = 2 * 60_000;

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Badge images use the same token on the main host; the es. backup is often unreachable. */
function imageUrl(value) {
  const text = clean(value);
  if (!/^https:\/\//i.test(text)) return '';
  try {
    const url = new URL(text);
    if (url.hostname.toLocaleLowerCase() === 'es.matchora.pro') url.hostname = 'matchora.pro';
    if (!/(^|\.)matchora\.(?:to|pro)$/i.test(url.hostname)) return '';
    return url.href;
  } catch {
    return '';
  }
}

function embedUrl(raw) {
  const text = clean(raw);
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:') return '';
    if (url.hostname.toLocaleLowerCase() === 'es.matchora.pro') url.hostname = 'matchora.pro';
    if (!/(^|\.)matchora\.(?:to|pro)$/i.test(url.hostname)) return '';
    if (!/^\/embed\/match\/[A-Za-z0-9_-]+$/.test(url.pathname)) return '';
    return url.href;
  } catch {
    return '';
  }
}

const MATCHORA_SKIP = new Set(['baseball', 'cricket', 'hockey', 'ice hockey']);

/** Live and upcoming matches with a clean embed, live first, then by kick-off time. */
export function normalizeMatchora(data, now = Date.now()) {
  const found = new Map();
  for (const item of Array.isArray(data?.events) ? data.events : []) {
    const id = clean(item?.id);
    if (!id || found.has(id)) continue;
    const home = clean(item?.home);
    const away = clean(item?.away);
    const name = away ? `${home} vs ${away}` : home;
    const input = embedUrl(item?.embed_url);
    if (!name || !input) continue;
    const sport = clean(item?.sport) || 'Other';
    if (MATCHORA_SKIP.has(sport.toLocaleLowerCase())) continue;
    const status = clean(item?.status).toUpperCase();
    const live = Boolean(item?.live) || status === 'LIVE';
    const finished = Boolean(item?.finished) || ['FT', 'AET', 'PEN', 'CANC', 'ABD'].includes(status);
    if (finished) continue;
    const starts = Number(item?.kickoff) > 0 ? Number(item.kickoff) * 1000 : 0;
    // A non-live fixture whose start is hours past is a stale row, not a game to add.
    if (!live && starts && starts < now - 3 * 3600 * 1000) continue;
    const channels = (Array.isArray(item?.channels) ? item.channels : [])
      .filter((channel) => channel && clean(channel.id) && clean(channel.name))
      .map((channel) => ({
        id: clean(channel.id),
        name: clean(channel.name),
        country: clean(channel.country),
        quality: clean(channel.quality),
        lang: clean(channel.lang),
      }));
    found.set(id, {
      id,
      name,
      home,
      away,
      league: clean(item?.league),
      sport,
      starts,
      live,
      score: clean(item?.score),
      minute: clean(item?.minute),
      channels,
      channelCount: Number(item?.channel_count) || channels.length,
      input,
      homeBadge: imageUrl(item?.home_badge),
      awayBadge: imageUrl(item?.away_badge),
      leagueBadge: imageUrl(item?.league_badge),
    });
  }
  return [...found.values()].sort((a, b) => (
    (a.live === b.live ? 0 : a.live ? -1 : 1)
    || (a.starts || Infinity) - (b.starts || Infinity)
    || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  ));
}

let cache = null;
let cachedAt = 0;
let pending = null;

/** The current Matchora schedule, or null when the service is quiet. One request at a time. */
export function loadMatchora(force = false) {
  if (!force && cache && Date.now() - cachedAt < CACHE_MS) return Promise.resolve(cache);
  if (pending) return pending;
  pending = fetch(API, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout?.(10000),
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data || typeof data !== 'object' || !Array.isArray(data.events)) return null;
      cache = normalizeMatchora(data);
      cachedAt = Date.now();
      return cache;
    })
    .catch(() => null)
    .finally(() => { pending = null; });
  return pending;
}
