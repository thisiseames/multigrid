// The Multigrid Ten: a personal list built on this device from what you actually watch.
// The catalogue is public (catalog.json, made from JustWatch); the taste never leaves the browser.

/** A title made comparable: "Dune (2021)", "Dune 2021" and "dune" all become "dune". */
export function titleKey(value) {
  const text = String(value || '')
    .trim()
    .replace(/[._]+/g, ' ')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\s+\b(19|20)\d{2}\s*$/, '')
    .replace(/\s*[-–—:]\s*(season|series|s)\s*\d+.*$/i, '')
    .replace(/\s+/g, ' ');
  return text
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(the|a|an) /, '')
    .trim();
}

const scored = (value, high) => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= high;

/** A film or show's rating from 0 to 1: 70% IMDb, 30% Rotten Tomatoes when both are there. */
export function ratingOf(entry = {}) {
  const parts = [];
  if (scored(entry.imdb, 10)) parts.push([Number(entry.imdb) / 10, 0.7]);
  if (entry.rt !== null && entry.rt !== undefined && Number.isFinite(Number(entry.rt))) parts.push([Number(entry.rt) / 100, 0.3]);
  const weight = parts.reduce((sum, [, share]) => sum + share, 0);
  return weight ? parts.reduce((sum, [value, share]) => sum + value * share, 0) / weight : 0;
}

/** How many people rated it, on a 0–1 scale: 1 million IMDb votes is the top. */
export const popularityOf = (entry = {}) => Math.min(1, Math.log10((Number(entry.imdbVotes) || 0) + 1) / 6);

/** A gentle nudge toward newer titles: 0 for 12 years old or more, 1 for this year. */
export function recencyOf(entry = {}, now = Date.now()) {
  const year = Number(entry.year);
  if (!year) return 0;
  const current = new Date(now).getFullYear();
  return Math.max(0, Math.min(1, (year - (current - 12)) / 12));
}

/**
 * What this device knows about your taste, from favourites, part-watched places and the titles
 * already finished. A title counts once, at its strongest weight: finished 3, favourite 1.5,
 * partway 1. Returns { weights, seen, basis, hasTaste }.
 */
export function tasteOf({ favorites = [], places = {}, watched = [], catalog = [] } = {}) {
  const byKey = new Map();
  for (const entry of Array.isArray(catalog) ? catalog : []) {
    const key = titleKey(entry?.title);
    if (!key) continue;
    const known = byKey.get(key);
    if (!known || (Number(entry.imdbVotes) || 0) > (Number(known.imdbVotes) || 0)) byKey.set(key, entry);
  }

  const titleWeights = new Map();
  const add = (name, weight) => {
    const key = titleKey(name);
    if (!key || !byKey.has(key)) return;
    titleWeights.set(key, Math.max(titleWeights.get(key) || 0, weight));
  };

  for (const favorite of Array.isArray(favorites) ? favorites : []) add(favorite?.name ?? favorite, 1.5);
  for (const place of Object.values(places || {})) {
    if (!place?.name || !place?.input) continue;
    const share = Number(place.length) > 0 ? Number(place.at) / Number(place.length) : 0;
    add(place.name, share >= 0.9 ? 3 : 1);
  }
  for (const name of Array.isArray(watched) ? watched : []) add(name, 3);

  const weights = {};
  const seen = new Set();
  for (const [key, weight] of titleWeights) {
    seen.add(key);
    for (const genre of byKey.get(key)?.genres || []) {
      if (!genre) continue;
      weights[genre] = (weights[genre] || 0) + weight;
    }
  }
  const basis = Object.entries(weights)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([genre]) => genre);
  return { weights, seen, basis, hasTaste: basis.length > 0 };
}

/** "crime and drama", or "" when there is no taste yet. */
export function basisText(basis = []) {
  const names = (Array.isArray(basis) ? basis : []).slice(0, 3).map((genre) => String(genre).toLowerCase());
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Whether the catalogue is recent enough to trust: seven days. */
export const catalogFresh = (updated, now = Date.now()) => {
  const stamp = Number(updated);
  return Number.isFinite(stamp) && stamp > 0 && now / 1000 - stamp < 7 * 86400;
};

/**
 * Ten films or shows from the catalogue, best first. Titles already in your taste are left out.
 * Four per primary genre to keep the list varied; if that leaves too few, the cap is relaxed.
 */
export function rankForYou({ catalog = [], taste = null, limit = 10, maxPerGenre = 4, now = Date.now() } = {}) {
  const count = Math.max(0, Number(limit) || 0);
  if (!count) return [];
  const seen = taste?.seen ?? new Set();
  const weights = taste?.weights ?? {};
  const maxWeight = Math.max(0, ...Object.values(weights));
  const hasTaste = maxWeight > 0;
  const items = [];

  for (const entry of Array.isArray(catalog) ? catalog : []) {
    const key = titleKey(entry?.title);
    if (!key || seen.has(key)) continue;
    const genres = (Array.isArray(entry.genres) ? entry.genres : []).filter(Boolean);
    const genreScore = hasTaste
      ? Math.min(1, genres.reduce((sum, genre) => sum + (Number(weights[genre]) || 0), 0) / maxWeight)
      : 0;
    const rating = ratingOf(entry);
    const recency = recencyOf(entry, now);
    const score = hasTaste
      ? (0.5 * genreScore) + (0.3 * rating) + (0.15 * popularityOf(entry)) + (0.05 * recency)
      : (0.55 * rating) + (0.3 * popularityOf(entry)) + (0.15 * recency);
    items.push({ entry, key, score, primary: genres[0] || '' });
  }

  // A remake with the same name is one choice: keep its stronger entry.
  const best = new Map();
  for (const item of items) {
    const known = best.get(item.key);
    if (!known || item.score > known.score) best.set(item.key, item);
  }
  const sorted = [...best.values()].sort((a, b) =>
    (b.score - a.score)
    || (ratingOf(b.entry) - ratingOf(a.entry))
    || ((Number(b.entry.imdbVotes) || 0) - (Number(a.entry.imdbVotes) || 0))
    || a.entry.title.localeCompare(b.entry.title));

  const picked = [];
  const skipped = [];
  const perGenre = new Map();
  for (const item of sorted) {
    if (picked.length >= count) break;
    const used = perGenre.get(item.primary) || 0;
    if (item.primary && used >= Math.max(1, Number(maxPerGenre) || 1)) {
      skipped.push(item);
      continue;
    }
    picked.push(item);
    if (item.primary) perGenre.set(item.primary, used + 1);
  }
  for (const item of skipped) {
    if (picked.length >= count) break;
    picked.push(item);
  }

  return picked.map((item, index) => ({
    ...item.entry,
    rank: index + 1,
    score: Math.round(item.score * 1000) / 1000,
  }));
}
