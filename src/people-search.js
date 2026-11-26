// Find an actor, director or creator by name. TMDB's public people search is read through the
// same r.jina.ai reader the title search uses; the existing X-Ray person page then loads the
// profile from Wikidata/Wikipedia. No key, account or server.

const READER = 'https://r.jina.ai/';
const SEARCH = 'https://www.themoviedb.org/search/person?query=';
const TTL = 10 * 60 * 1000;
const cache = new Map();
const inflight = new Map();

const clean = (value) => String(value || '')
  .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\s+/g, ' ')
  .replace(/"\)$/, '')
  .trim();

const faceUrl = (url) => String(url || '').replace(/\/t\/p\/w90_and_h90_face\//, '/t/p/w185_and_h185_face/');

/** People in a TMDB people search page, in the order TMDB ranks them. */
export function parseTmdbPeople(markdown) {
  const text = String(markdown || '');
  if (!text) return [];
  const photos = new Map();
  for (const match of text.matchAll(/\[!\[[^\]]*\]\(([^)]+)\)\]\(https:\/\/www\.themoviedb\.org\/person\/(\d+)-[^)]+\)/g)) {
    const id = Number(match[2]);
    if (Number.isInteger(id) && !photos.has(id)) photos.set(id, faceUrl(match[1]));
  }
  const links = [...text.matchAll(/^\[([^\]]+)\]\(https:\/\/www\.themoviedb\.org\/person\/(\d+)-[^)]*\)/gm)];
  const items = [];
  const seen = new Set();
  for (let index = 0; index < links.length; index += 1) {
    const match = links[index];
    const id = Number(match[2]);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    const next = links[index + 1]?.index ?? text.length;
    const tail = text.slice(match.index + match[0].length, next);
    const line = tail.match(/^\s*([A-Za-z ]+) •\s*(.*)$/m);
    const name = clean(match[1]);
    if (!name) continue;
    seen.add(id);
    items.push({
      id,
      name,
      photo: photos.get(id) || '',
      department: clean(line?.[1] || ''),
      knownFor: clean(line?.[2] || '').slice(0, 180),
    });
    if (items.length >= 8) break;
  }
  return items;
}

export async function searchTmdbPeople(query, { fetchImpl = fetch } = {}) {
  const text = String(query || '').trim();
  if (text.length < 2) return { items: [], failed: false };
  const key = text.toLocaleLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return { items: hit.items.map((item) => ({ ...item })), failed: false };
  if (inflight.has(key)) return inflight.get(key);
  const asked = (async () => {
    try {
      const response = await fetchImpl(`${READER}${SEARCH}${encodeURIComponent(text)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`TMDB people ${response.status}`);
      const items = parseTmdbPeople(await response.text());
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
