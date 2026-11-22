// PPV.st's public stream directory: live events, each with its own poster and embed address.
// The API is free and keyless. Ask when the picker opens, and keep the answer for a minute.

const API = 'https://api.ppv.st/api/streams';
const CACHE_MS = 60_000;

const httpsOnly = (raw) => {
  const url = typeof raw === 'string' && raw.startsWith('http://') ? `https://${raw.slice(7)}` : raw || '';
  return /^https:\/\//.test(url) ? url : '';
};

const isHex = (value) => /^#[0-9a-f]{6}$/i.test(String(value || ''));

/** The API usually gives a URL, but accept an iframe snippet too. */
function iframeSource(raw) {
  const text = String(raw || '').trim();
  const match = text.match(/<iframe\b[^>]*\bsrc=["']([^"']+)/i);
  return httpsOnly(match ? match[1] : text);
}

/** Live events first, then upcoming, then the always-on channels; past events are dropped. */
export function normalizePPV(data, now = Date.now()) {
  const found = [];
  for (const category of Array.isArray(data?.streams) ? data.streams : []) {
    for (const stream of Array.isArray(category?.streams) ? category.streams : []) {
      const name = String(stream?.name || '').replace(/\s+/g, ' ').trim();
      const input = iframeSource(stream?.iframe) || iframeSource(stream?.substreams?.[0]?.iframe);
      if (!name || !input) continue;
      const starts = Number(stream.starts_at) > 0 ? Number(stream.starts_at) * 1000 : 0;
      const ends = Number(stream.ends_at) > 0 ? Number(stream.ends_at) * 1000 : 0;
      const always = Boolean(Number(stream.always_live));
      const live = always || (starts > 0 && starts <= now && (!ends || now < ends));
      const upcoming = starts > now;
      const past = ends > 0 && ends <= now && !Number(stream.allowpaststreams);
      if (past) continue;
      found.push({
        id: Number(stream.id) || 0,
        name,
        category: String(stream.category_name || stream.category || category?.category || '').trim(),
        tag: String(stream.tag || '').trim(),
        source: String(stream.source_tag || '').trim(),
        poster: httpsOnly(stream.poster),
        colors: (Array.isArray(stream.colors) ? stream.colors : []).filter(isHex).slice(0, 2),
        input,
        starts,
        ends,
        always,
        live,
        upcoming,
      });
    }
  }
  const rank = (item) => (item.live && !item.always ? 0 : item.upcoming ? 1 : item.always ? 2 : 3);
  return found.sort((a, b) => {
    const order = rank(a) - rank(b);
    if (order) return order;
    // Live events: the one that started most recently comes first, so a new game isn't
    // buried behind everything that has been on since the morning.
    if (rank(a) === 0) return b.starts - a.starts || a.name.localeCompare(b.name);
    return (a.starts || Infinity) - (b.starts || Infinity) || a.name.localeCompare(b.name);
  });
}

/** Darts, from any source (PPV.st, Daddy Live, Matchora): the owner doesn't want it anywhere. */
export const isDarts = (event) => /\bdarts?\b/i.test([event?.category, event?.sport, event?.league, event?.tag, event?.name, ...(event?.categories ?? [])].filter(Boolean).join(' '));

const skipToday = (event) => event.category === 'Ice Hockey' || isDarts(event)
  || /\b(college|ncaa)\b/i.test(`${event.tag} ${event.source}`);

/** The six events Today shows: live or starting in the next six hours, without college sports, hockey or darts. */
export function todayPPV(events, now = Date.now(), limit = 6) {
  const end = now + 6 * 3600 * 1000;
  return (events ?? [])
    .filter((event) => !event.always && !skipToday(event)
      && (event.live || (event.upcoming && event.starts <= end)))
    .slice(0, limit);
}

let cache = null;
let cachedAt = 0;
let pending = null;

/** The current event list, or null when the service is quiet. One request at a time. */
export function loadPPV(force = false) {
  if (!force && cache && Date.now() - cachedAt < CACHE_MS) return Promise.resolve(cache);
  if (pending) return pending;
  pending = fetch(API, { cache: 'no-store', signal: AbortSignal.timeout?.(8000) })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data?.success) return null;
      cache = normalizePPV(data);
      cachedAt = Date.now();
      return cache;
    })
    .catch(() => null)
    .finally(() => { pending = null; });
  return pending;
}
