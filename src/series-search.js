// Find a film or TV show by name. TMDB's public search pages are read through the same r.jina.ai
// reader MULTIGRID already uses for YouTube and TikTok; that gives the exact TMDB number Atlantic,
// Cinejoy and 1Flex all use. No key, account or server, and results are cached for ten minutes.

const READER = 'https://r.jina.ai/';
const SEARCH = {
  show: 'https://www.themoviedb.org/search/tv?query=',
  film: 'https://www.themoviedb.org/search/movie?query=',
  any: 'https://www.themoviedb.org/search/multi?query=',
};
const TTL = 10 * 60 * 1000;
const cache = new Map();
const inflight = new Map();

const decode = (value) => String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, code) => {
  const key = String(code).toLocaleLowerCase();
  if (key === 'amp') return '&';
  if (key === 'lt') return '<';
  if (key === 'gt') return '>';
  if (key === 'quot') return '"';
  if (key === 'apos') return "'";
  if (key === 'nbsp') return ' ';
  const number = key.startsWith('#x') ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
  return Number.isFinite(number) ? String.fromCodePoint(number) : match;
});

const plain = (value) => decode(String(value || '')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[*_`#>]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim());

const firstName = (slug) => plain(String(slug || '').replace(/-/g, ' '))
  .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

export function displayTitle(value) {
  const text = plain(value);
  return text && text === text.toLocaleLowerCase()
    ? text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    : text;
}

/** A TMDB poster at card size, not the 94 px search thumbnail. */
export function tmdbPosterUrl(url) {
  return String(url || '').replace(/\/t\/p\/(?:w94_and_h141_face|w154|w300)\//, '/t/p/w342/');
}

/** Favourites are all caps, not title case: "ozark" and "Ozark" both become "OZARK". */
export const favoriteTitle = (value) => plain(value).toLocaleUpperCase();

const titleKey = (value) => String(value || '')
  .toLocaleLowerCase()
  .normalize('NFKD')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/^(?:the|a|an)\s+/, '')
  .trim();

/** Films and TV shows in a TMDB search page, in the order TMDB ranks them. */
export function parseTmdbSearch(markdown) {
  const text = String(markdown || '');
  if (!text) return [];
  // One result can be a linked poster, a heading, an empty link or all three. The linked poster
  // starts the block when there is one; a heading or empty link starts it otherwise.
  const found = new Map();
  const add = (media, id, at, title = '', poster = '') => {
    const number = Number(id);
    if ((media !== 'tv' && media !== 'movie') || !Number.isInteger(number) || number <= 0) return;
    const key = `${media}:${number}`;
    const entry = found.get(key);
    if (!entry || at < entry.at) {
      found.set(key, {
        id: number, media, kind: media === 'tv' ? 'show' : 'film', at,
        title: title || entry?.title || '', poster: poster || entry?.poster || '',
      });
      return;
    }
    if (!entry.title) entry.title = title;
    if (!entry.poster) entry.poster = poster;
  };
  for (const match of text.matchAll(/\[!\[(?:Image \d+:\s*)?([^\]]*)\]\(([^)]+)\)\]\(https:\/\/www\.themoviedb\.org\/(tv|movie)\/(\d+)-[^)]+\)/g)) {
    add(match[3], match[4], match.index, match[1], match[2]);
  }
  for (const match of text.matchAll(/##\s*\[([^\]]+)\]\(https:\/\/www\.themoviedb\.org\/(tv|movie)\/(\d+)-[^)]+\)/g)) {
    add(match[2], match[3], match.index, match[1]);
  }
  for (const match of text.matchAll(/https:\/\/www\.themoviedb\.org\/(tv|movie)\/(\d+)-[^\s)"']+/g)) {
    add(match[1], match[2], match.index);
  }
  const blocks = [...found.values()].sort((a, b) => a.at - b.at);
  const items = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const entry = blocks[index];
    const end = blocks[index + 1]?.at ?? text.length;
    const block = text.slice(entry.at, end);
    const image = block.match(/!\[(?:Image \d+:\s*)?([^\]]*)\]\(([^)]+)\)/);
    const heading = block.match(/##\s*\[([^\]]+)\]\(/);
    const slug = block.match(/\/(?:tv|movie)\/\d+-([^)\s"']+)/)?.[1] || '';
    const title = displayTitle(entry.title || heading?.[1] || image?.[1] || firstName(slug));
    if (!title) continue;
    const date = block.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+(19\d{2}|20\d{2})\b/)
      || block.match(/\b(19\d{2}|20\d{2})\b/);
    const after = date ? block.slice(date.index + date[0].length) : block;
    const overview = after.split(/\n\s*\n/)
      .map((line) => plain(line))
      .find((line) => line.length > 20
        && !/^(watch now|play|similar shows|on apple tv|there are no .* that matched your query\.?|tip:)\b/i.test(line)) || '';
    items.push({
      id: entry.id,
      kind: entry.kind,
      media: entry.media,
      title,
      year: Number(date?.[2] || date?.[1] || 0),
      poster: tmdbPosterUrl(entry.poster ? decode(entry.poster) : image?.[2] ? decode(image[2]) : ''),
      overview: overview.slice(0, 320),
    });
    if (items.length >= 8) break;
  }
  return items;
}

/** TV shows only, for the existing Find a show sheet. */
export function parseTmdbSeriesSearch(markdown) {
  return parseTmdbSearch(markdown).filter((item) => item.kind === 'show');
}

/** The multi-search page answers with TMDB's JSON, not the HTML search page. */
export function parseTmdbMultiJson(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let answer;
  try { answer = JSON.parse(raw.slice(start, end + 1)); } catch { return []; }
  const items = [];
  for (const result of Array.isArray(answer?.results) ? answer.results : []) {
    const kind = result.media_type === 'tv' ? 'show' : result.media_type === 'movie' ? 'film' : '';
    const id = Number(result.id);
    const title = displayTitle(result.name || result.title);
    if (!kind || !Number.isInteger(id) || id <= 0 || !title) continue;
    const date = String(result.first_air_date || result.release_date || '');
    items.push({
      id,
      kind,
      media: kind === 'show' ? 'tv' : 'movie',
      title,
      year: Number(date.slice(0, 4)) || 0,
      poster: result.poster_path ? `https://image.tmdb.org/t/p/w342${result.poster_path}` : '',
      overview: plain(result.overview || '').slice(0, 320),
    });
    if (items.length >= 8) break;
  }
  return items;
}

/** The one exact title/year match, or null when the picker should decide. */
export function bestTmdbMatch(items, { title = '', year = 0, kind = 'any' } = {}) {
  const wanted = kind === 'film' ? 'film' : kind === 'show' ? 'show' : '';
  const key = titleKey(title);
  if (!key) return null;
  const pool = (Array.isArray(items) ? items : []).filter((item) => item
    && Number(item.id) > 0 && (!wanted || item.kind === wanted) && titleKey(item.title) === key);
  if (!pool.length) return null;
  if (Number(year) > 0) {
    const exact = pool.filter((item) => Number(item.year) === Number(year));
    return exact.length === 1 ? exact[0] : null;
  }
  return pool.length === 1 ? pool[0] : null;
}

/** Search TMDB for films, shows, or both. A failed page is reported, not cached as no results. */
export async function searchTmdbTitles(query, kind = 'show', { fetchImpl = fetch } = {}) {
  const text = String(query || '').trim();
  if (text.length < 2) return { items: [], failed: false };
  const wanted = kind === 'film' ? 'film' : kind === 'any' ? 'any' : 'show';
  const key = `${wanted}|${text.toLocaleLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return { items: hit.items.map((item) => ({ ...item })), failed: false };
  if (inflight.has(key)) return inflight.get(key);
  const asked = (async () => {
    try {
      const response = await fetchImpl(`${READER}${SEARCH[wanted]}${encodeURIComponent(text)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`TMDB search ${response.status}`);
      const raw = await response.text();
      const all = wanted === 'any' && /{\s*"results"\s*:/.test(raw) ? parseTmdbMultiJson(raw) : parseTmdbSearch(raw);
      const items = wanted === 'any' ? all : all.filter((item) => item.kind === wanted);
      cache.set(key, { at: Date.now(), items });
      return { items: items.map((item) => ({ ...item })), failed: false };
    } catch {
      return { items: [], failed: true };
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, asked);
  return asked;
}

export const searchTmdbSeries = (query, options = {}) => searchTmdbTitles(query, 'show', options);
