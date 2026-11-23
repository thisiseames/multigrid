// Reading JustWatch's popular-title answers for catalog.json. Kept apart so the tests can check
// the parsing and merging without the network.

import { titleKey } from '../src/for-you.js';
import { scoresOf } from './top10-rows.mjs';

/** The genre names JustWatch uses, in plain English. */
export const GENRE_NAMES = {
  act: 'Action', ani: 'Animation', cmy: 'Comedy', crm: 'Crime', doc: 'Documentary', drm: 'Drama',
  eur: 'European', fml: 'Family', fnt: 'Fantasy', hrr: 'Horror', hst: 'History', msc: 'Music',
  rly: 'Reality', rma: 'Romance', scf: 'Sci-Fi', spt: 'Sport', trl: 'Thriller', war: 'War', wsn: 'Western',
};

/** The six genres the daily job asks for, to keep the pool varied. */
export const GENRE_QUERIES = [
  { code: 'drm', name: 'Drama' },
  { code: 'cmy', name: 'Comedy' },
  { code: 'crm', name: 'Crime' },
  { code: 'trl', name: 'Thriller' },
  { code: 'act', name: 'Action' },
  { code: 'scf', name: 'Sci-Fi' },
];

const plain = (text) => String(text || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

const imageOf = (content) => {
  const raw = content?.backdrops?.find((one) => one?.backdropUrl)?.backdropUrl;
  if (!raw) return '';
  const url = raw.startsWith('http') ? raw : `https://images.justwatch.com${raw}`;
  return url.replace('{profile}', 's1440').replace('{format}', 'jpg');
};

/** One JustWatch node as a catalogue title, or null when it can't make a good card. */
export function catalogEntry(node) {
  const content = node?.content ?? {};
  const title = String(content.title || '').trim();
  const kind = node?.objectType === 'MOVIE' ? 'film' : node?.objectType === 'SHOW' ? 'show' : '';
  if (!title || !kind) return null;
  const image = imageOf(content);
  if (!image) return null;
  const scores = scoresOf(content);
  if (!scores.imdb && !Number.isFinite(scores.rt)) return null;
  const genres = [...new Set((content.genres ?? []).map((genre) => GENRE_NAMES[genre?.shortName]).filter(Boolean))];
  return {
    title,
    year: Number(content.originalReleaseYear) || 0,
    kind,
    genres,
    image,
    desc: plain(content.shortDescription),
    ...scores,
  };
}

/** Every good title in one popularTitles answer. */
export function catalogTitles(answer) {
  const edges = answer?.data?.popularTitles?.edges;
  if (!Array.isArray(edges)) return [];
  return edges.map((edge) => catalogEntry(edge?.node)).filter(Boolean);
}

const keyOf = (entry) => `${titleKey(entry.title)}|${entry.year || ''}`;

/** The same title from several genres is one entry, with all its genres and its best scores. */
export function mergeCatalog(entries) {
  const out = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.title) continue;
    const key = keyOf(entry);
    const known = out.get(key);
    if (!known) {
      out.set(key, { ...entry, genres: [...new Set(entry.genres || [])] });
      continue;
    }
    const genres = [...new Set([...(known.genres || []), ...(entry.genres || [])])];
    const richer = (Number(entry.imdbVotes) || 0) > (Number(known.imdbVotes) || 0) ? entry : known;
    out.set(key, { ...richer, genres });
  }
  return [...out.values()].sort((a, b) => a.title.localeCompare(b.title) || (a.year || 0) - (b.year || 0));
}
