// Scores: IMDb ratings for films and shows anywhere in MULTIGRID. A weekly job (tools/build-scores.mjs)
// turns IMDb's own free files into small pieces in scores/, one per first two letters of a title,
// so the browser fetches only what it needs and matches by name (and year, when known).

/** A title made comparable: lower case, no accents or punctuation, no leading "the". */
export function normTitle(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(the|a|an) /, '')
    .trim();
}

/** Which piece a title lives in: its first two letters or digits ("bl" for Black Doves). */
export function shardKey(title) {
  const key = normTitle(title).replace(/ /g, '').slice(0, 2);
  return /^[a-z0-9]{2}$/.test(key) ? key : '_';
}

const TYPES = { movie: 'film', tvMovie: 'film', tvSeries: 'show', tvMiniSeries: 'show' };
export const typeOf = (imdbType) => TYPES[imdbType] || '';

/**
 * The best match in a piece: the same title, then the closest year (when given) and the kind
 * ('film' or 'show', when given), then the most votes. Entries are [norm, title, year, type, id, rating, votes].
 */
export function findScore(entries, title, { year = 0, kind = '' } = {}) {
  const wanted = normTitle(title);
  if (!wanted || !Array.isArray(entries)) return null;
  const same = entries.filter((entry) => entry[0] === wanted && (!kind || typeOf(entry[3]) === kind));
  if (!same.length) return null;
  const close = year ? same.filter((entry) => Math.abs((entry[2] || 0) - year) <= 1) : same;
  const pool = close.length ? close : (year ? [] : same);
  if (!pool.length) return null;
  const best = pool.reduce((a, b) => (b[6] > a[6] ? b : a));
  return { id: best[4], title: best[1], year: best[2], kind: typeOf(best[3]), rating: best[5], votes: best[6] };
}

/** "82K", "1.2M": how many people voted. */
export function votesText(votes) {
  if (votes >= 1e6) return `${(votes / 1e6).toFixed(votes >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (votes >= 1e3) return `${Math.round(votes / 1e3)}K`;
  return String(votes || 0);
}

/** "IMDb 7.2", with "RT 94%" when Rotten Tomatoes is known. */
export function scoreLine({ imdb = null, rt = null } = {}) {
  return [imdb ? `IMDb ${Number(imdb).toFixed(1)}` : '', Number.isFinite(rt) ? `RT ${rt}%` : ''].filter(Boolean).join(' · ');
}
