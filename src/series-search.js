// Find a TV show by name. TMDB's public search page is read through the same r.jina.ai reader
// MULTIGRID already uses for YouTube and TikTok; that gives the exact TMDB number Atlantic,
// Cinejoy and 1Flex all use. No key, account or server, and results are cached for ten minutes.

const READER = 'https://r.jina.ai/';
const SEARCH = 'https://www.themoviedb.org/search/tv?query=';
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

const yearOf = (value) => Number(String(value || '').match(/\b(19\d{2}|20\d{2})\b/)?.[1] || 0);

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

/** TV shows in a TMDB search page, in the order TMDB ranks them. */
export function parseTmdbSeriesSearch(markdown) {
  const text = String(markdown || '');
  if (!text) return [];
  // One result can be a linked poster, a heading, an empty link or all three. The linked poster
  // starts the block when there is one; a heading or empty link starts it otherwise.
  const found = new Map();
  const add = (id, at, title = '', poster = '') => {
    const number = Number(id);
    if (!Number.isInteger(number) || number <= 0) return;
    const entry = found.get(number);
    if (!entry || at < entry.at) {
      found.set(number, { id: number, at, title: title || entry?.title || '', poster: poster || entry?.poster || '' });
      return;
    }
    if (!entry.title) entry.title = title;
    if (!entry.poster) entry.poster = poster;
  };
  for (const match of text.matchAll(/\[!\[(?:Image \d+:\s*)?([^\]]*)\]\(([^)]+)\)\]\(https:\/\/www\.themoviedb\.org\/tv\/(\d+)-[^)]+\)/g)) {
    add(match[3], match.index, match[1], match[2]);
  }
  for (const match of text.matchAll(/##\s*\[([^\]]+)\]\(https:\/\/www\.themoviedb\.org\/tv\/(\d+)-[^)]+\)/g)) {
    add(match[2], match.index, match[1]);
  }
  for (const match of text.matchAll(/https:\/\/www\.themoviedb\.org\/tv\/(\d+)-[^\s)"']+/g)) {
    add(match[1], match.index);
  }
  const blocks = [...found.values()].sort((a, b) => a.at - b.at);
  const items = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const entry = blocks[index];
    const end = blocks[index + 1]?.at ?? text.length;
    const block = text.slice(entry.at, end);
    const image = block.match(/!\[(?:Image \d+:\s*)?([^\]]*)\]\(([^)]+)\)/);
    const heading = block.match(/##\s*\[([^\]]+)\]\(/);
    const slug = block.match(/\/tv\/\d+-([^)\s"']+)/)?.[1] || '';
    const title = displayTitle(entry.title || heading?.[1] || image?.[1] || firstName(slug));
    if (!title) continue;
    // The movies section follows the last TV result; its story must not attach to that show.
    const content = block.split(/https:\/\/www\.themoviedb\.org\/movie\/\d+-/)[0];
    const date = content.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+(19\d{2}|20\d{2})\b/)
      || content.match(/\b(19\d{2}|20\d{2})\b/);
    const after = date ? content.slice(date.index + date[0].length) : content;
    const overview = after.split(/\n\s*\n/)
      .map((line) => plain(line))
      .find((line) => line.length > 20
        && !/^(watch now|play|similar shows|on apple tv|there are no .* that matched your query\.?|tip:)\b/i.test(line)) || '';
    items.push({
      id: entry.id,
      title,
      year: Number(date?.[2] || date?.[1] || 0),
      poster: tmdbPosterUrl(entry.poster ? decode(entry.poster) : image?.[2] ? decode(image[2]) : ''),
      overview: overview.slice(0, 320),
    });
    if (items.length >= 8) break;
  }
  return items;
}

/** Search TMDB for TV shows. A failed page is reported, not cached as an empty result. */
export async function searchTmdbSeries(query, { fetchImpl = fetch } = {}) {
  const text = String(query || '').trim();
  if (text.length < 2) return { items: [], failed: false };
  const key = text.toLocaleLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return { items: hit.items.map((item) => ({ ...item })), failed: false };
  if (inflight.has(key)) return inflight.get(key);
  const asked = (async () => {
    try {
      const response = await fetchImpl(`${READER}${SEARCH}${encodeURIComponent(text)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`TMDB search ${response.status}`);
      const items = parseTmdbSeriesSearch(await response.text());
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
