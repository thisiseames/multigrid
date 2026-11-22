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

const SEARCH_API = 'https://itunes.apple.com/search';
const LOOKUP_API = 'https://itunes.apple.com/lookup';
const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'aac']);

const cache = new Map();

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
