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
      start: start * 1000,
      end: end * 1000,
      title: String(title),
      about: String(about),
      live: String(flags).includes('L'),
      // A one-off for Today: S special, P premiere, F finale. M is a film on a movie channel.
      special: String(flags).includes('S'),
      premiere: String(flags).includes('P'),
      finale: String(flags).includes('F'),
      movie: String(flags).includes('M'),
    }))
    .filter((show) => show.end > now)
    .sort((a, b) => a.start - b.start);
  return shows.length ? shows : null;
}

/** Logos for channels whose schedule source doesn't provide one; the guide's own logo wins. */
const EXTRA_LOGOS = {
  ELEVENSPORTS: { url: 'https://upload.wikimedia.org/wikipedia/commons/d/d6/Logo_Eleven_Sports_2020.png', tone: 'light' },
  ELEVENSPORTS1: { url: 'https://upload.wikimedia.org/wikipedia/commons/d/d6/Logo_Eleven_Sports_2020.png', tone: 'light' },
  SUPERSPORT: { url: 'https://supersport.com/images/SuperSportsLogo.svg', tone: 'dark' },
  SUPERSPORTPREMIERLEAGUE: { url: 'https://supersport.com/images/SuperSportsLogo.svg', tone: 'dark' },
  SUPERSPORTLALIGA: { url: 'https://supersport.com/images/SuperSportsLogo.svg', tone: 'dark' },
  UFCFIGHTPASS: { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/99/UFC_Fight_Pass_Logo.svg/960px-UFC_Fight_Pass_Logo.svg.png', tone: 'dark' },
  UFCFIGHTPASS247: { url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/99/UFC_Fight_Pass_Logo.svg/960px-UFC_Fight_Pass_Logo.svg.png', tone: 'dark' },
  FOXSPORTSNEWS: { url: 'https://thumb.wikimedia.org/wikipedia/en/thumb/9/93/Fox_Sports_News_Australia_Logo.svg/960px-Fox_Sports_News_Australia_Logo.svg.png', tone: 'light' },
  SPORTSNET: { url: 'https://upload.wikimedia.org/wikipedia/en/0/00/Sportsnet_logo.svg', tone: 'light' },
  EUROSPORT2UK: { url: 'https://upload.wikimedia.org/wikipedia/commons/d/d8/Eurosport_2_Logo_2015.svg', tone: 'light' },
};

/** A TV channel's logo and whether it's made for a dark or light background, or null. */
export function logoFor(name) {
  const logo = guide?.logos?.[guideKey(name)] ?? EXTRA_LOGOS[guideKey(name)];
  return logo && typeof logo.url === 'string' && /^https:\/\//.test(logo.url) ? { url: logo.url, tone: logo.tone === 'dark' ? 'dark' : 'light' } : null;
}

/** Shows from `from` to `to` for a favorite, for the timeline. */
export function showsBetween(name, source, from, to) {
  return (listingsFor(name, source) ?? []).filter((show) => show.end > from && show.start < to);
}

/** Put a folder directly after another, leaving every other folder where it is. */
export function folderAfter(folders, folder, after) {
  const index = folders.findIndex((name) => guideKey(name) === guideKey(after));
  const next = [...folders];
  next.splice(index >= 0 ? index + 1 : next.length, 0, folder);
  return next;
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

export const currentShow = (name, source) => nowAndNext(name, source)?.current ?? null;

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });

/** 2:00 pm, the way he reads times. */
export const clock = (ms) => timeFormat.format(new Date(ms)).replace(/\s?([AP])\.?M\.?/i, (_, half) => ` ${half.toLowerCase()}m`);
