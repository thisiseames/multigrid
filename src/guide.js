// The TV guide: what's on now and next for favorites that are real TV channels.
// guide.json is made every few hours by tools/build-guide.mjs, run on GitHub.

/** "Sky Sports +" and "SKY SPORTS PLUS" are the same channel. */
export const guideKey = (name) => name.toUpperCase().replace(/\+/g, 'PLUS').replace(/[^A-Z0-9]/g, '');

// Streams that only look like channel names, such as a YouTube channel called "Sky Sports Premier League".
const NOT_TV = new Set(['youtube', 'twitch', 'tiktok', 'x', 'kick', 'file']);

let guide = null;
let loadedAt = 0;
let loading = null;

/** Fetches the guide, at most every 15 minutes. Resolves to whether a guide is there. */
export function loadGuide(force = false) {
  if (!force && guide && Date.now() - loadedAt < 15 * 60 * 1000) return Promise.resolve(true);
  loading ??= fetch('guide.json', { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (data && typeof data.updated === 'number' && data.channels && typeof data.channels === 'object') {
        guide = data;
        loadedAt = Date.now();
      }
      return Boolean(guide);
    })
    .catch(() => Boolean(guide))
    .finally(() => { loading = null; });
  return loading;
}

export const guideUpdated = () => (guide ? guide.updated * 1000 : 0);

/** The listings for a favorite: [{ title, start, end }] from now on, or null if it has none. */
export function listingsFor(name, source) {
  if (!guide || (source && NOT_TV.has(source.kind))) return null;
  const rows = guide.channels[guideKey(name)];
  if (!Array.isArray(rows)) return null;
  const now = Date.now();
  const shows = rows
    .filter((row) => Array.isArray(row) && row.length >= 3 && row.length <= 5)
    .map(([start, end, title, about = '', flags = '']) => ({
      start: start * 1000, end: end * 1000, title: String(title), about: String(about), live: String(flags).includes('L'),
    }))
    .filter((show) => show.end > now)
    .sort((a, b) => a.start - b.start);
  return shows.length ? shows : null;
}

/** A TV channel's logo and whether it's made for a dark or light background, or null. */
export function logoFor(name) {
  const logo = guide?.logos?.[guideKey(name)];
  return logo && typeof logo.url === 'string' && /^https:\/\//.test(logo.url) ? { url: logo.url, tone: logo.tone === 'dark' ? 'dark' : 'light' } : null;
}

/** Shows from `from` to `to` for a favorite, for the timeline. */
export function showsBetween(name, source, from, to) {
  return (listingsFor(name, source) ?? []).filter((show) => show.end > from && show.start < to);
}

/** What's on now and what's next. Either can be missing, e.g. between listings. */
export function nowAndNext(name, source) {
  const shows = listingsFor(name, source);
  if (!shows) return null;
  const now = Date.now();
  const current = shows.find((show) => show.start <= now && now < show.end) || null;
  const next = shows.find((show) => show.start > now) || null;
  return current || next ? { current, next } : null;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });

/** 2:00 pm, the way he reads times. */
export const clock = (ms) => timeFormat.format(new Date(ms)).replace(/\s?([AP])\.?M\.?/i, (_, half) => ` ${half.toLowerCase()}m`);
