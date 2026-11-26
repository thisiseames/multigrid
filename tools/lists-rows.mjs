// The public IMDb and Rotten Tomatoes list pages, read by tools/build-lists.mjs and turned
// into small cards. The lists carry titles and pictures; the app's own Find sheet resolves
// the exact TMDB/Atlantic link when Add is pressed. No key and no third-party backend.

import { parseHTML } from 'linkedom';

const clean = (value) => String(value || '')
  .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\s+Link to .+$/i, '')
  .replace(/\s+/g, ' ')
  .trim();

const yearOf = (value) => Number(String(value || '').match(/\b(19\d{2}|20\d{2})\b/)?.[1] || 0);

const titles = (value) => clean(value).replace(/^Image \d+:\s*/i, '').replace(/^(\d+)\.\s*/, '').trim();

/** The 90 px thumbnails these pages use, asked for at card size instead. */
const imdbPoster = (url) => String(url || '').replace(/\._V1_.*$/, '._V1_QL75_UX300_CR0,0,300,444_.jpg');
const rtPoster = (url) => String(url || '').replace(/(resizing\.flixster\.com\/[^/]+\/)(?:\d+x\d+)\//, '$1300x450/');

/** The poster that sits just before each IMDb title link, keyed by its tt id. */
const imdbPosters = (text) => {
  const map = new Map();
  for (const match of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)\s*\[\]\(https:\/\/www\.imdb\.com\/title\/(tt\d+)\//g)) {
    if (!map.has(match[2])) map.set(match[2], imdbPoster(match[1]));
  }
  return map;
};

/** An IMDb chart page (MOVIEmeter, TVMeter). */
export function imdbChartRows(markdown, kind = 'film', limit = 20) {
  const text = String(markdown || '');
  const posters = imdbPosters(text);
  const rows = [];
  for (const match of text.matchAll(/#(\d+)\s+####\s+\[([^\]]+)\]\(https:\/\/www\.imdb\.com\/title\/(tt\d+)[^)]*\)/g)) {
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 400);
    rows.push({
      rank: Number(match[1]),
      title: titles(match[2]),
      year: yearOf(after),
      kind,
      poster: posters.get(match[3]) || '',
      url: `https://www.imdb.com/title/${match[3]}/`,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

/** An IMDb editorial list (Col Needham's Hidden Gems), where each entry is "1. Title". */
export function imdbListRows(markdown, kind = 'film', limit = 20) {
  const text = String(markdown || '');
  const posters = imdbPosters(text);
  const rows = [];
  for (const match of text.matchAll(/####\s+\[(\d+)\.\s+([^\]]+)\]\(https:\/\/www\.imdb\.com\/title\/(tt\d+)[^)]*\)/g)) {
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 400);
    rows.push({
      rank: Number(match[1]),
      title: titles(match[2]),
      year: yearOf(after),
      kind,
      poster: posters.get(match[3]) || '',
      url: `https://www.imdb.com/title/${match[3]}/`,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

/** A title from an IMDb image description: "Cast in The Show (2024)" or "The Show (2024)". */
function fromImageAlt(alt) {
  const raw = titles(alt);
  const split = raw.match(/^(.*?)(?: in )([A-Z].*?)\s*\((19\d{2}|20\d{2})\)$/);
  if (split) return { title: clean(split[2]), year: Number(split[3]) };
  const dated = raw.match(/^(.*?)\s*\((19\d{2}|20\d{2})\)$/);
  return dated ? { title: clean(dated[1]), year: Number(dated[2]) } : { title: raw, year: 0 };
}

/** IMDb's Nielsen "Streaming TV Top 100", whose list links have no text and only a picture. */
export function imdbStreamingRows(markdown, kind = 'show', limit = 20) {
  const text = String(markdown || '');
  const rows = [];
  const seen = new Set();
  for (const match of text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)\s*\[\]\(https:\/\/www\.imdb\.com\/title\/(tt\d+)\//g)) {
    if (seen.has(match[3])) continue;
    const found = fromImageAlt(match[1]);
    if (!found.title || /^tt\d+$/.test(found.title)) continue;
    seen.add(match[3]);
    rows.push({
      rank: rows.length + 1,
      title: found.title,
      year: found.year,
      kind,
      poster: imdbPoster(match[2]),
      url: `https://www.imdb.com/title/${match[3]}/`,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

/** A Rotten Tomatoes browse page (Certified Fresh, Verified Hot, Most Popular TV). */
export function rtBrowseRows(html, kind = 'film', limit = 20) {
  const { document } = parseHTML(String(html || ''));
  const rows = [];
  const seen = new Set();
  for (const tile of document.querySelectorAll('poster-tile[data-qa="discovery-media-list-item"]')) {
    const title = clean(tile.parentElement?.querySelector('[data-qa="discovery-media-list-item-title"]')?.textContent);
    const href = tile.getAttribute('media-url') || '';
    if (!title || !/^\/(?:m|tv)\//.test(href) || seen.has(href)) continue;
    seen.add(href);
    const date = clean(tile.parentElement?.querySelector('[data-qa="discovery-media-list-item-start-date"]')?.textContent);
    rows.push({
      rank: rows.length + 1,
      title,
      year: yearOf(date),
      kind,
      poster: rtPoster(tile.querySelector('rt-img')?.getAttribute('src') || ''),
      url: `https://www.rottentomatoes.com${href}`,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

/** An RT editorial "Best ..." page, where each entry is a numbered poster. */
export function rtEditorialRows(markdown, { kind = 'film', year = 0, limit = 20 } = {}) {
  const text = String(markdown || '');
  const rows = [];
  const seen = new Set();
  for (const match of text.matchAll(/#(\d+)\s*\[!\[[^\]]*?:\s*([^\]]+)\]\(([^)]+)\)\]\((https:\/\/www\.rottentomatoes\.com\/(?:m|tv)\/[^)]+)\)/g)) {
    const title = clean(match[2]).replace(/:\s*Season \d+$/i, '');
    if (!title || seen.has(title.toLocaleLowerCase())) continue;
    seen.add(title.toLocaleLowerCase());
    rows.push({
      rank: Number(match[1]),
      title,
      year,
      kind,
      poster: rtPoster(match[3]),
      url: match[4],
    });
    if (rows.length >= limit) break;
  }
  return rows;
}
