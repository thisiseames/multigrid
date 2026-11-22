// Extra information for the local library: TVmaze episode names/synopses and Wikipedia/Wikidata
// movie details. Everything is free and keyless; local folder names never leave the device
// except as a show/movie title in the lookup. Results are cached for a week.

const CACHE_KEY = 'multigrid.libraryMeta.v1';
const TTL = 7 * 24 * 60 * 60 * 1000;
const EMPTY_TTL = 60 * 60 * 1000;
const MAX_ENTRIES = 60;

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch { return {}; }
};
const writeCache = (cache) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* not cached */ }
};

export const normalizeTitle = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/\b(film|movie)\b/g, ' ')
  .replace(/[^\w]+/g, ' ')
  .trim();

const withoutArticle = (value) => value.replace(/^(the|a|an) /, '').replace(/ (the|a|an)$/, '');
const showKey = (value) => withoutArticle(normalizeTitle(value));
const episodeKey = (season, number) => `${Number(season) || 0}:${Number(number) || 0}`;

export function cleanText(value, limit = 260) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

export function showMetaFromTvMaze(show, episodes) {
  if (!show?.id) return null;
  const list = {};
  for (const episode of Array.isArray(episodes) ? episodes : []) {
    if (!episode?.number) continue;
    const key = episodeKey(episode.season, episode.number);
    list[key] = {
      title: cleanText(episode.name, 120),
      airdate: String(episode.airdate || ''),
      summary: cleanText(episode.summary, 260),
    };
  }
  return { id: String(show.id), name: cleanText(show.name, 120), episodes: list };
}

export const episodeMeta = (meta, season, number) => meta?.episodes?.[episodeKey(season, number)] || null;

const pageYear = (title) => Number(String(title || '').match(/\((\d{4})(?:\s+(?:film|movie))?\)/i)?.[1] || 0);

function pageMatches(page, title, year) {
  if (!page?.title) return false;
  const wanted = withoutArticle(normalizeTitle(title));
  const pageTitle = withoutArticle(normalizeTitle(String(page.title).replace(/\([^)]*\)/g, '')));
  if (!wanted || !pageTitle) return false;
  if (pageTitle !== wanted && !pageTitle.includes(wanted) && !wanted.includes(pageTitle)) return false;
  const foundYear = pageYear(page.title);
  return !year || !foundYear || Math.abs(foundYear - year) <= 1;
}

const firstClaim = (entity, property) => entity?.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;

export function movieMetaFromWiki(page, entity = null, labels = {}) {
  if (!page?.title) return null;
  const cast = (entity?.claims?.P161 || [])
    .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
    .filter(Boolean)
    .map((id) => labels?.[id]?.labels?.en?.value || '')
    .filter(Boolean)
    .slice(0, 8);
  const runtime = firstClaim(entity, 'P2047')?.amount;
  return {
    title: cleanText(page.title, 120),
    plot: cleanText(page.extract, 900),
    cast,
    runtime: runtime ? `${Math.round(Number(runtime))} min` : '',
    url: page.fullurl || '',
  };
}

async function getJson(url, fetchImpl) {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout?.(8000) });
    if (!response.ok) return { ok: false, status: response.status, data: null };
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false, data: null };
  }
}

const cachedValue = (key, now) => {
  const entry = readCache()[key];
  if (!entry || now - (entry.at || 0) > (entry.value ? TTL : EMPTY_TTL)) return undefined;
  return entry.value;
};
const remember = (key, value, now) => {
  const cache = readCache();
  cache[key] = { at: now, value };
  const keys = Object.keys(cache).sort((a, b) => (cache[b].at || 0) - (cache[a].at || 0));
  for (const old of keys.slice(MAX_ENTRIES)) delete cache[old];
  writeCache(cache);
};

/** TVmaze show/episode details for one local show, or null when there is no confident match. */
export async function loadShowMeta(name, { fetchImpl = fetch, now = Date.now() } = {}) {
  const key = `show:${showKey(name)}`;
  const known = cachedValue(key, now);
  if (known !== undefined) return known;
  const search = await getJson(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(name)}`, fetchImpl);
  if (!search.ok) {
    if (search.status === 404) remember(key, null, now);
    return null;
  }
  if (!search.data?.id || showKey(search.data.name) !== showKey(name)) {
    remember(key, null, now);
    return null;
  }
  const episodes = await getJson(`https://api.tvmaze.com/shows/${encodeURIComponent(search.data.id)}/episodes`, fetchImpl);
  if (!episodes.ok || !Array.isArray(episodes.data)) return null;
  const value = showMetaFromTvMaze(search.data, episodes.data);
  remember(key, value, now);
  return value;
}

/** Wikipedia/Wikidata plot, cast and runtime for one local movie. */
export async function loadMovieMeta(title, year, { fetchImpl = fetch, now = Date.now } = {}) {
  const key = `movie:${withoutArticle(normalizeTitle(title))}|${Number(year) || ''}`;
  const known = cachedValue(key, now);
  if (known !== undefined) return known;
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: [title, year, 'film'].filter(Boolean).join(' '),
    gsrlimit: '5',
    prop: 'extracts|pageprops|info',
    inprop: 'url',
    exintro: '1',
    explaintext: '1',
    format: 'json',
    origin: '*',
  });
  const data = await getJson(`https://en.wikipedia.org/w/api.php?${params}`, fetchImpl);
  if (!data.ok) return null;
  const pages = Object.values(data.data?.query?.pages || {}).sort((a, b) => (a.index || 99) - (b.index || 99));
  const page = pages.find((item) => pageMatches(item, title, year));
  if (!page) {
    remember(key, null, now);
    return null;
  }
  let entity = null;
  let labels = {};
  const qid = page.pageprops?.wikibase_item;
  if (qid) {
    const entityData = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=claims&format=json&origin=*`, fetchImpl);
    entity = entityData.ok ? (entityData.data?.entities?.[qid] || null) : null;
    const castIds = (entity?.claims?.P161 || [])
      .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
      .filter(Boolean)
      .slice(0, 8);
    if (castIds.length) {
      const labelData = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(castIds.join('|'))}&props=labels&languages=en&format=json&origin=*`, fetchImpl);
      labels = labelData.ok ? (labelData.data?.entities || {}) : {};
    }
  }
  const value = movieMetaFromWiki(page, entity, labels);
  remember(key, value, now);
  return value;
}

export function clearLibraryMetaCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* not cached */ }
}
