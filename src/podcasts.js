// Apple's public podcast directory. No key, no account, no server: the search and
// lookup endpoints allow this site to read them, and the audio is the publisher's own file.
// Apple asks for caching and limits the API to roughly 20 calls a minute.

export const PODCAST_COUNTRY = 'CA';
export const FOLLOWED_PREFIX = 'podcastshow:';
export const SEARCH_TTL = 10 * 60 * 1000;
export const SHOW_TTL = 30 * 60 * 1000;
export const MAX_SHOWS = 12;
export const MAX_SEARCH_EPISODES = 20;
export const MAX_SHOW_EPISODES = 50;
// Topic search hides tiny news/AI clips; a followed show still shows its short episodes.
export const MIN_SEARCH_EPISODE_SECONDS = 5 * 60;
export const PODCAST_CHARTS_PATH = 'podcast-charts.json';
export const MAX_CHART_SHOWS = 25;
export const MAX_CHART_EPISODES = 10;
export const CHART_STALE_MS = 48 * 60 * 60 * 1000;

const SEARCH_API = 'https://itunes.apple.com/search';
const LOOKUP_API = 'https://itunes.apple.com/lookup';
const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'aac']);

const cache = new Map();
let chartCache = null;

/** Tests use this so one case cannot see another case's answers. */
export function clearPodcastCache() {
  cache.clear();
}

export const followedShowInput = (id) => `${FOLLOWED_PREFIX}${String(id ?? '').trim()}`;
export const isPodcastShowInput = (input) => typeof input === 'string' && input.startsWith(FOLLOWED_PREFIX);
export const showIdFromInput = (input) => (isPodcastShowInput(input) ? input.slice(FOLLOWED_PREFIX.length) : '');

/** A show name without the store's subtitle, punctuation or "podcast" filler. */
export function showNameKey(value) {
  return String(value)
    .toLocaleLowerCase()
    // Apple often adds a subtitle after a dash; the Reader uses just the show name.
    .replace(/\s+[|–—]\s+.*$/, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+podcast\s*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The same show across the Reader feed and Apple's directory, without merging short lookalikes. */
export function sameShowName(a, b) {
  const left = showNameKey(a);
  const right = showNameKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [short, long] = left.length < right.length ? [left, right] : [right, left];
  return short.split(' ').length >= 3 && long.startsWith(`${short} `);
}

const cleanUrl = (value) => String(value).replace(/&amp;/g, '&');

/** Apple sends the artwork at several sizes; pick the biggest secure one. */
function artwork(item) {
  for (const value of [item?.artworkUrl600, item?.artworkUrl160, item?.artworkUrl100, item?.artworkUrl60]) {
    if (typeof value !== 'string' || !value) continue;
    const clean = cleanUrl(value);
    const secure = clean.startsWith('http://') ? `https://${clean.slice(7)}` : clean;
    if (/^https:\/\//.test(secure)) return secure;
  }
  return '';
}

const secureUrl = (value) => {
  if (typeof value !== 'string' || !value) return '';
  const clean = cleanUrl(value);
  const secure = clean.startsWith('http://') ? `https://${clean.slice(7)}` : clean;
  return /^https:\/\//.test(secure) ? secure : '';
};

// Audio is never upgraded: an http-only file would be blocked as mixed content, not fixed.
const httpsAudio = (value) => {
  if (typeof value !== 'string' || !value) return '';
  const clean = cleanUrl(value);
  return /^https:\/\//.test(clean) ? clean : '';
};

/** A show result from search or lookup, or null if it isn't a show we can use. */
export function normalizeShow(item) {
  const kind = item?.kind || item?.wrapperType;
  if (kind !== 'podcast' && kind !== 'collection') return null;
  const id = String(item?.collectionId ?? '').trim();
  const name = String(item?.collectionName || item?.trackName || '').trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    author: String(item?.artistName || '').trim(),
    art: artwork(item),
    appleUrl: secureUrl(item?.collectionViewUrl),
    count: Number(item?.trackCount) || 0,
  };
}

/** An episode result, or null when it has no full HTTPS audio file we can play. */
export function normalizeEpisode(item) {
  if (item?.kind !== 'podcast-episode') return null;
  const id = String(item?.trackId ?? item?.episodeGuid ?? '').trim();
  const title = String(item?.trackName || '').trim();
  const audio = httpsAudio(item?.episodeUrl);
  if (!id || !title || !audio) return null;
  const extension = String(item?.episodeFileExtension || '').toLocaleLowerCase();
  if (extension && !AUDIO_EXTENSIONS.has(extension)) return null;
  const length = Math.round((Number(item?.trackTimeMillis) || 0) / 1000);
  const time = Date.parse(item?.releaseDate || '') || 0;
  return {
    id,
    title,
    source: String(item?.collectionName || '').trim() || 'Podcast',
    image: artwork(item),
    audio,
    length: length > 0 ? length : 0,
    time,
    appleUrl: secureUrl(item?.trackViewUrl),
  };
}

/** The chart feed's 100px artwork can be asked for at 600px; the suffix is the only difference. */
export function chartArtwork(value) {
  const secure = secureUrl(value);
  return secure ? secure.replace(/\/\d+x\d+bb\.[a-z]+$/i, '/600x600bb.jpg') : '';
}

/** The show ID in an Apple Podcasts URL: .../id1200361736, or .../id1112425552?i=... */
export function parseAppleShowId(value) {
  const match = String(value ?? '').match(/\/id(\d+)(?:[?#]|$)/);
  return match ? match[1] : '';
}

/** Validate the chart file the job writes; a missing, malformed or 48-hour-old file gives null. */
export function readPodcastCharts(data, { now = Date.now() } = {}) {
  const raw = Number(data?.updated);
  const updated = raw > 0 && raw < 1e12 ? raw * 1000 : raw;
  if (!Number.isFinite(updated) || updated <= 0 || now - updated > CHART_STALE_MS) return null;
  const shows = (Array.isArray(data?.shows) ? data.shows : [])
    .map((show, index) => {
      const id = String(show?.id ?? '').trim();
      const name = String(show?.name ?? '').trim();
      if (!id || !name) return null;
      const rank = Number(show?.rank);
      return {
        rank: Number.isFinite(rank) && rank > 0 ? Math.floor(rank) : index + 1,
        id,
        name,
        author: String(show?.author ?? '').trim(),
        art: secureUrl(show?.art),
        appleUrl: secureUrl(show?.appleUrl),
        genre: String(show?.genre ?? '').trim(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_CHART_SHOWS);
  const episodes = (Array.isArray(data?.episodes) ? data.episodes : [])
    .map((episode, index) => {
      const id = String(episode?.id ?? '').trim();
      const title = String(episode?.title ?? '').trim();
      const audio = httpsAudio(episode?.audio);
      if (!id || !title || !audio) return null;
      const rank = Number(episode?.rank);
      const length = Math.round(Number(episode?.length) || 0);
      const time = Number(episode?.time) || 0;
      return {
        rank: Number.isFinite(rank) && rank > 0 ? Math.floor(rank) : index + 1,
        id,
        title,
        source: String(episode?.source ?? '').trim() || 'Podcast',
        image: secureUrl(episode?.image),
        audio,
        length: length > 0 ? length : 0,
        time: time > 0 ? time : 0,
        appleUrl: secureUrl(episode?.appleUrl),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_CHART_EPISODES);
  if (!shows.length && !episodes.length) return null;
  return { updated, country: String(data?.country || 'ca'), shows, episodes };
}

/** Read the job-built chart file once per ten minutes; a missing file is retried after a minute. */
export async function loadPodcastCharts({ fetchImpl = fetch, now = Date.now(), force = false, signal } = {}) {
  const ttl = chartCache?.value ? 10 * 60 * 1000 : 60 * 1000;
  if (!force && chartCache && now - chartCache.at < ttl) return chartCache.value;
  try {
    const response = await fetchImpl(PODCAST_CHARTS_PATH, { cache: 'no-cache', signal });
    if (!response.ok) {
      chartCache = { at: now, value: null };
      return null;
    }
    const value = readPodcastCharts(await response.json(), { now });
    chartCache = { at: now, value };
    return value;
  } catch {
    chartCache = { at: now, value: null };
    return null;
  }
}

export function clearPodcastChartCache() {
  chartCache = null;
}

const dedupe = (items, key) => {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

function appleUrl(path, params) {
  const url = new URL(path);
  url.search = new URLSearchParams(params).toString();
  return url.href;
}

async function request(url, { fetchImpl = fetch, signal } = {}) {
  const timeout = !signal && typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(15000)
    : undefined;
  let response;
  try {
    response = await fetchImpl(url, { signal: signal || timeout });
  } catch (error) {
    // A cancelled search is not an error the dialog should show.
    if (error?.name === 'AbortError') throw error;
    const friendly = new Error("Apple didn't answer.");
    friendly.cause = error;
    throw friendly;
  }
  if (!response.ok) {
    const error = new Error(response.status === 429
      ? 'Apple is limiting searches. Wait a minute.'
      : "Apple didn't answer.");
    error.status = response.status;
    throw error;
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Apple didn't answer.");
  }
}

async function remembered(key, ttl, now, load) {
  const hit = cache.get(key);
  if (hit && now - hit.at < ttl) return hit.value;
  const value = await load();
  cache.set(key, { at: now, value });
  return value;
}

/** Shows for a search term, newest/relevance order from Apple, at most 12. */
export function searchShows(term, { fetchImpl = fetch, signal, now = Date.now() } = {}) {
  const query = String(term ?? '').trim();
  if (query.length < 2) return Promise.resolve([]);
  const key = `shows:${query.toLocaleLowerCase()}`;
  return remembered(key, SEARCH_TTL, now, async () => {
    const data = await request(appleUrl(SEARCH_API, {
      term: query, media: 'podcast', entity: 'podcast', country: PODCAST_COUNTRY, limit: String(MAX_SHOWS),
    }), { fetchImpl, signal });
    return dedupe((data?.results ?? []).map(normalizeShow).filter(Boolean), (item) => item.id).slice(0, MAX_SHOWS);
  });
}

/** Recent episodes across shows for a topic, with tiny clips removed. */
export function searchEpisodes(term, { fetchImpl = fetch, signal, now = Date.now() } = {}) {
  const query = String(term ?? '').trim();
  if (query.length < 2) return Promise.resolve([]);
  const key = `episodes:${query.toLocaleLowerCase()}`;
  return remembered(key, SEARCH_TTL, now, async () => {
    const data = await request(appleUrl(SEARCH_API, {
      term: query, media: 'podcast', entity: 'podcastEpisode', country: PODCAST_COUNTRY,
      limit: String(MAX_SEARCH_EPISODES * 2),
    }), { fetchImpl, signal });
    return dedupe((data?.results ?? []).map(normalizeEpisode).filter(Boolean), (item) => item.id)
      .filter((item) => !item.length || item.length >= MIN_SEARCH_EPISODE_SECONDS)
      .slice(0, MAX_SEARCH_EPISODES);
  });
}

/** A followed show's latest episodes, newest first. The show itself is the first lookup result. */
export function lookupShowEpisodes(id, { fetchImpl = fetch, signal, now = Date.now() } = {}) {
  const showId = String(id ?? '').trim();
  if (!showId) return Promise.resolve([]);
  const key = `show:${showId}`;
  return remembered(key, SHOW_TTL, now, async () => {
    const data = await request(appleUrl(LOOKUP_API, {
      id: showId, entity: 'podcastEpisode', country: PODCAST_COUNTRY, limit: String(MAX_SHOW_EPISODES),
    }), { fetchImpl, signal });
    return dedupe((data?.results ?? []).map(normalizeEpisode).filter(Boolean), (item) => item.id)
      .sort((a, b) => (b.time || 0) - (a.time || 0))
      .slice(0, MAX_SHOW_EPISODES);
  });
}
