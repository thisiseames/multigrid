// Landscape backdrops for the IMDb and RT Home rows. JustWatch is already the source for the
// Ten and Netflix rows; it answers the same public search question without a key. A title only
// takes a picture when its name, kind and year match, so a remake never borrows the wrong art.

const JUSTWATCH = 'https://apis.justwatch.com/graphql';

export const JUSTWATCH_SEARCH = `query($country: Country!, $language: Language!, $query: String!) {
  searchTitles(source: "multigrid", country: $country, language: $language, first: 6, filter: { searchQuery: $query, objectTypes: [MOVIE, SHOW] }) {
    edges { node {
      objectType
      content(country: $country, language: $language) {
        title originalReleaseYear shortDescription backdrops { backdropUrl }
        clips(country: $country, language: $language) { sourceUrl externalId provider name }
      }
    } }
  }
}`;

const keyOfTitle = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export const rowKey = (entry) => `${entry.kind}|${keyOfTitle(entry.title)}|${Number(entry.year) || 0}`;

const kindOf = (node) => (node?.objectType === 'MOVIE' ? 'film' : node?.objectType === 'SHOW' ? 'show' : '');

const backdropOf = (content) => {
  const raw = content?.backdrops?.find((one) => one?.backdropUrl)?.backdropUrl;
  if (!raw) return '';
  const full = raw.startsWith('http') ? raw : `https://images.justwatch.com${raw}`;
  return full.replace('{profile}', 's1440').replace('{format}', 'jpg');
};

/** The first official trailer or teaser on YouTube in JustWatch's clip list, or ''. */
const trailerOf = (content) => {
  const clips = Array.isArray(content?.clips) ? content.clips : [];
  const rank = (name) => /official trailer/i.test(name) ? 0 : /\btrailer\b/i.test(name) ? 1 : /official teaser/i.test(name) ? 2 : /\bteaser\b/i.test(name) ? 3 : 9;
  return clips.map((clip) => {
    if (clip?.provider !== 'YOUTUBE') return null;
    const id = /^[\w-]{11}$/.test(String(clip.externalId || ''))
      ? String(clip.externalId)
      : String(clip.sourceUrl || '').match(/[?&]v=([\w-]{11})/)?.[1] || '';
    const name = String(clip.name || '');
    return id && rank(name) < 9 ? { id, rank: rank(name) } : null;
  }).filter(Boolean).sort((a, b) => a.rank - b.rank)[0]?.id || '';
};

/**
 * The one JustWatch result that is the same title and kind, or null. IMDb rows know the release
 * year, so they only accept a near year. RT's list date is often the article or streaming date,
 * not the title's year, so those rows accept the closest exact-title match and keep its real year.
 */
export function bestJustWatchMatch(answer, entry, { strictYear = true } = {}) {
  const edges = answer?.data?.searchTitles?.edges;
  if (!Array.isArray(edges)) return null;
  const wantedTitle = keyOfTitle(entry?.title);
  const wantedKind = entry?.kind === 'film' || entry?.kind === 'show' ? entry.kind : '';
  const wantedYear = Number(entry?.year) || 0;
  if (!wantedTitle || !wantedKind) return null;
  const exact = edges
    .map((edge) => edge?.node)
    .filter((node) => node && kindOf(node) === wantedKind)
    .map((node) => ({
      node,
      title: keyOfTitle(node.content?.title),
      year: Number(node.content?.originalReleaseYear) || 0,
      image: backdropOf(node.content),
      desc: String(node.content?.shortDescription || '').trim().slice(0, 400),
      trailer: trailerOf(node.content),
    }))
    .filter((found) => found.title === wantedTitle)
    .filter((found) => !strictYear || !wantedYear || !found.year || Math.abs(found.year - wantedYear) <= 1);
  if (!exact.length) return null;
  exact.sort((a, b) => {
    const exactYear = Number(Boolean(b.year && b.year === wantedYear)) - Number(Boolean(a.year && a.year === wantedYear));
    if (exactYear) return exactYear;
    const picture = Number(Boolean(b.image)) - Number(Boolean(a.image));
    if (picture) return picture;
    if (wantedYear) return Math.abs(a.year - wantedYear) - Math.abs(b.year - wantedYear) || b.year - a.year;
    return b.year - a.year;
  });
  const best = exact[0];
  return { image: best.image, desc: best.desc, year: best.year, trailer: best.trailer };
}

/** Ask JustWatch's public search for one title. */
export async function askJustWatch(entry, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(JUSTWATCH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'MULTIGRID-lists/1.0' },
    body: JSON.stringify({ query: JUSTWATCH_SEARCH, variables: { country: 'CA', language: 'en', query: entry.title } }),
    signal: AbortSignal.timeout?.(25000),
  });
  if (!response.ok) throw new Error(`JustWatch answered ${response.status}`);
  return response.json();
}

/**
 * Every entry gains image/desc and the title's real year when JustWatch has it. `reuse` keeps a
 * previous picture (IMDb rows); RT rows ask again because their list year is not the release year.
 */
export async function addJustWatchArt(entries, { previous = [], lookup = askJustWatch, reuse = true, refresh = false } = {}) {
  const old = new Map(previous.map((entry) => [rowKey(entry), entry]));
  const cache = new Map();
  let asked = 0;
  let found = 0;
  const out = [];
  for (const entry of entries) {
    const key = rowKey(entry);
    if (!cache.has(key)) {
      const kept = reuse && !refresh ? old.get(key) : null;
      if (kept?.image) {
        cache.set(key, { image: kept.image, desc: kept.desc || '', year: kept.year || 0, trailer: kept.trailer || '' });
      } else {
        try {
          const art = await lookup(entry);
          cache.set(key, art || {});
          asked += 1;
          if (art?.image) found += 1;
        } catch {
          cache.set(key, {});
          asked += 1;
        }
      }
    }
    const art = cache.get(key);
    out.push({
      ...entry,
      ...(art.year ? { year: art.year } : {}),
      ...(art.image ? { image: art.image } : {}),
      ...(art.desc ? { desc: art.desc } : {}),
      ...(art.trailer ? { trailer: art.trailer } : {}),
    });
  }
  return { entries: out, asked, found };
}
