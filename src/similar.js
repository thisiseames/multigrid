// "More like this" for the show in X-Ray. The page cannot call JustWatch (no CORS); the
// MULTIGRID Sound extension fetches the neighbours and this module parses, filters and caches them.

import { titleKey } from './for-you.js';

const CACHE_KEY = 'multigrid.similar.v1';
const TTL = 7 * 86400000;
const MAX = 100;
const LIMIT = 5;

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const plain = (text) => clean(text).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const imageOf = (content) => {
  const raw = content?.backdrops?.find((one) => one?.backdropUrl)?.backdropUrl;
  if (!raw) return '';
  const url = raw.startsWith('http') ? raw : `https://images.justwatch.com${raw}`;
  return url.replace('{profile}', 's1440').replace('{format}', 'jpg');
};

const scoresOf = (content) => {
  const scoring = content?.scoring ?? {};
  const out = {};
  if (Number.isFinite(scoring.imdbScore) && scoring.imdbScore > 0) out.imdb = Math.round(scoring.imdbScore * 10) / 10;
  if (Number.isFinite(scoring.imdbVotes) && scoring.imdbVotes > 0) out.imdbVotes = scoring.imdbVotes;
  if (Number.isFinite(scoring.tomatoMeter)) out.rt = scoring.tomatoMeter;
  if (scoring.certifiedFresh === true) out.fresh = true;
  return out;
};

export const similarKey = (title, kind = 'show') => `${kind === 'film' ? 'film' : 'show'}:${titleKey(title)}`;

/** JustWatch's raw similarTitles nodes as clean cards, same kind only, current show excluded. */
export function parseSimilar(nodes, { title = '', kind = 'show', limit = LIMIT, seedGenres = [] } = {}) {
  if (!Array.isArray(nodes)) return [];
  const wantedKind = kind === 'film' ? 'film' : 'show';
  const seed = new Set((Array.isArray(seedGenres) ? seedGenres : []).filter(Boolean));
  const minShared = seed.size >= 4 ? 3 : seed.size >= 3 ? 2 : seed.size >= 2 ? 1 : 0;
  const seen = new Set([titleKey(title)]);
  const out = [];
  for (const node of nodes) {
    const type = node?.objectType === 'MOVIE' ? 'film' : node?.objectType === 'SHOW' ? 'show' : '';
    if (type !== wantedKind) continue;
    const content = node.content ?? {};
    const name = clean(content.title);
    const key = titleKey(name);
    if (!name || !key || seen.has(key)) continue;
    if (minShared) {
      const shared = (content.genres ?? []).filter((genre) => seed.has(genre?.shortName)).length;
      if (shared < minShared) continue;
    }
    const image = imageOf(content);
    if (!image) continue;
    const scores = scoresOf(content);
    if (!scores.imdb && !Number.isFinite(scores.rt)) continue;
    const quality = Math.max((Number(scores.imdb) || 0) * 10, Number.isFinite(scores.rt) ? scores.rt : 0);
    if (quality < 60) continue;
    seen.add(key);
    out.push({
      title: name,
      year: Number(content.originalReleaseYear) || 0,
      kind: type,
      image,
      desc: plain(content.shortDescription),
      ...scores,
    });
    if (out.length >= Math.max(1, Number(limit) || LIMIT)) break;
  }
  return out;
}

const read = () => {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch { return {}; }
};
const write = (value) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch { /* cache is a bonus */ }
};

/** Cached cards for a show, or null when there is nothing recent. */
export function cachedSimilar(title, kind = 'show', now = Date.now()) {
  const key = similarKey(title, kind);
  const entry = read()[key];
  if (!entry || !Array.isArray(entry.items) || now - (Number(entry.at) || 0) > TTL) return null;
  return entry.items;
}

/** Keep the newest 100 shows. */
export function saveSimilar(title, kind, items, now = Date.now()) {
  if (!Array.isArray(items)) return;
  const key = similarKey(title, kind);
  const cache = read();
  cache[key] = { at: now, items };
  const keys = Object.keys(cache).sort((a, b) => (Number(cache[b]?.at) || 0) - (Number(cache[a]?.at) || 0));
  for (const old of keys.slice(MAX)) delete cache[old];
  write(cache);
}

/** Ask the extension for the raw JustWatch nodes; resolves null if it doesn't answer. */
export function requestSimilar({ title, kind = 'show', timeout = 4000 } = {}) {
  const name = clean(title);
  if (!name || typeof window === 'undefined' || typeof window.postMessage !== 'function') return Promise.resolve(null);
  const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    let timer = null;
    const done = (value) => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      window.removeEventListener('message', onMessage);
      resolve(value);
    };
    const onMessage = (event) => {
      if (event.source !== window) return;
      const reply = event.data?.multigridSimilarReply;
      if (!reply || reply.id !== id) return;
      if (reply.error || !Array.isArray(reply.items)) { done(null); return; }
      done({ items: reply.items, genres: Array.isArray(reply.genres) ? reply.genres : [] });
    };
    window.addEventListener('message', onMessage);
    timer = setTimeout(() => done(null), Math.max(500, Number(timeout) || 4000));
    window.postMessage({ multigridSimilar: { id, title: name, kind: kind === 'film' ? 'film' : 'show' } }, '*');
  });
}

/** Cards for a show: cache first, otherwise ask the extension and cache the answer. */
export async function similarFor({ title, kind = 'show', now = Date.now() } = {}) {
  const name = clean(title);
  if (!name) return [];
  const cached = cachedSimilar(name, kind, now);
  if (cached) return cached;
  const answer = await requestSimilar({ title: name, kind });
  if (!answer) return [];
  const items = parseSimilar(answer.items, { title: name, kind, seedGenres: answer.genres });
  saveSimilar(name, kind, items, now);
  return items;
}
