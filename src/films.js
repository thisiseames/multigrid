// Films and people for X-Ray, from Wikidata (free, no key, answers browsers directly).
// TVmaze knows shows but not films, and nobody's other work; Wikidata knows both, and stores the
// TMDB number Atlantic uses in its links, so a person's films and shows can be played straight away.
// Built here without the page (query text + parsing) so it can be tested.

export const SPARQL = 'https://query.wikidata.org/sparql';
const LANGS = 'en,mul,fr,es,de,it';

/** The address that asks Wikidata a question; the answer is JSON. */
export const sparqlUrl = (query) => `${SPARQL}?format=json&query=${encodeURIComponent(query)}`;

const quote = (text) => `"${String(text).replace(/["\\]/g, '')}"`;
const value = (row, key) => row?.[key]?.value ?? '';
const itemId = (uri) => String(uri || '').match(/Q\d+$/)?.[0] ?? '';
/** A label Wikidata had no name for comes back as its Q-number: not a name. */
const realName = (text) => (text && !/^Q\d+$/.test(text) ? text : '');
/** A Commons file as a small picture. */
export const commonsThumb = (file, width = 240) => (file ? `${String(file).replace(/^http:/, 'https:')}?width=${width}` : '');

/**
 * The film with this TMDB number (from an Atlantic link) or IMDb id ("tt…"): its name, year,
 * runtime, directors, genres, official trailer and English Wikipedia page.
 */
export function filmQuery({ tmdb = '', imdb = '' } = {}) {
  const match = tmdb ? `?film wdt:P4947 ${quote(tmdb)}.` : `?film wdt:P345 ${quote(imdb)}.`;
  return `SELECT ?film ?filmLabel ?date ?dur ?yt ?tmdb ?imdb ?article ?dirLabel ?genreLabel WHERE {
  ${match}
  OPTIONAL { ?film wdt:P577 ?date. }
  OPTIONAL { ?film wdt:P2047 ?dur. }
  OPTIONAL { ?film wdt:P1651 ?yt. }
  OPTIONAL { ?film wdt:P4947 ?tmdb. }
  OPTIONAL { ?film wdt:P345 ?imdb. }
  OPTIONAL { ?article schema:about ?film; schema:isPartOf <https://en.wikipedia.org/>. }
  OPTIONAL { ?film wdt:P57 ?dir. }
  OPTIONAL { ?film wdt:P136 ?genre. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${LANGS}". }
} LIMIT 200`;
}

/** A film from filmQuery's answer, or null. */
export function parseFilm(answer) {
  const rows = answer?.results?.bindings ?? [];
  if (!rows.length) return null;
  const first = rows[0];
  const years = rows.map((row) => Number(value(row, 'date').slice(0, 4))).filter((year) => year > 1880);
  const list = (key) => [...new Set(rows.map((row) => realName(value(row, key))).filter(Boolean))];
  const article = rows.map((row) => value(row, 'article')).find(Boolean) || '';
  return {
    id: itemId(value(first, 'film')),
    name: realName(value(first, 'filmLabel')) || (article ? decodeURIComponent(article.split('/wiki/')[1] || '').replace(/_/g, ' ') : ''),
    year: years.length ? Math.min(...years) : 0,
    minutes: Math.round(Number(rows.map((row) => value(row, 'dur')).find(Boolean) || 0)),
    trailer: rows.map((row) => value(row, 'yt')).find((id) => /^[\w-]{11}$/.test(id)) || '',
    tmdb: rows.map((row) => value(row, 'tmdb')).find(Boolean) || '',
    imdb: rows.map((row) => value(row, 'imdb')).find((id) => /^tt\d+$/.test(id)) || '',
    wiki: article ? decodeURIComponent(article.split('/wiki/')[1] || '') : '',
    directors: list('dirLabel').slice(0, 3),
    genres: list('genreLabel').slice(0, 3),
  };
}

/** The cast of a film or show (by Wikidata item), best known first, with photos. */
export function castQuery(item) {
  return `SELECT ?p ?pLabel ?img ?links ?roleLabel WHERE {
  wd:${item} p:P161 ?st. ?st ps:P161 ?p.
  OPTIONAL { ?st pq:P453 ?role. }
  OPTIONAL { ?p wdt:P18 ?img. }
  OPTIONAL { ?p wikibase:sitelinks ?links. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${LANGS}". }
} LIMIT 300`;
}

/** People from castQuery's answer: [{ id, name, photo, character }], best known first. */
export function parseCast(answer, max = 18) {
  const people = new Map();
  for (const row of answer?.results?.bindings ?? []) {
    const id = itemId(value(row, 'p'));
    const name = realName(value(row, 'pLabel'));
    if (!id || !name) continue;
    const kept = people.get(id) ?? { id, name, photo: '', character: '', links: 0 };
    kept.photo ||= commonsThumb(value(row, 'img'));
    kept.character ||= realName(value(row, 'roleLabel'));
    kept.links = Math.max(kept.links, Number(value(row, 'links') || 0));
    people.set(id, kept);
  }
  return [...people.values()].sort((a, b) => b.links - a.links).slice(0, max).map(({ links, ...person }) => person);
}

/** A person by name (from TVmaze's cast): the actor of that name best known on Wikipedia. */
export function personByNameQuery(name) {
  return `SELECT ?p ?links WHERE {
  ?p rdfs:label ${quote(name)}@en; wdt:P31 wd:Q5.
  ?p wikibase:sitelinks ?links.
  FILTER EXISTS { ?work wdt:P161 ?p. }
} ORDER BY DESC(?links) LIMIT 1`;
}

/** The Wikidata item from personByNameQuery's answer, or ''. */
export const parsePersonId = (answer) => itemId(value(answer?.results?.bindings?.[0], 'p'));

/** Who a person is: name, one line about them, photo, year born, Wikipedia page. */
export function personInfoQuery(item) {
  return `SELECT ?pLabel ?pDescription ?img ?born ?art WHERE {
  BIND(wd:${item} AS ?p)
  OPTIONAL { ?p wdt:P18 ?img. }
  OPTIONAL { ?p wdt:P569 ?born. }
  OPTIONAL { ?art schema:about ?p; schema:isPartOf <https://en.wikipedia.org/>. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${LANGS}". }
} LIMIT 5`;
}

/**
 * Every film and show a person is in that has a TMDB number (so Atlantic can play it), one row
 * each. Grouped in the query: asking for labels row by row took 19 s for a busy actor; this ~1 s.
 */
export function personWorksQuery(item) {
  return `SELECT ?work (SAMPLE(?en) AS ?workLabel) (SAMPLE(?ml) AS ?mulLabel) (MIN(?d) AS ?date) (SAMPLE(?m) AS ?tmdbm) (SAMPLE(?t) AS ?tmdbtv) (SAMPLE(?i) AS ?imdb) (MAX(?n) AS ?links) (MAX(?a) AS ?above) (SAMPLE(?wart) AS ?article) WHERE {
  ?work wdt:P161 wd:${item}.
  OPTIONAL { ?work wdt:P4947 ?m. }
  OPTIONAL { ?work wdt:P4983 ?t. }
  FILTER(BOUND(?m) || BOUND(?t))
  OPTIONAL { ?work wdt:P577 ?d. }
  OPTIONAL { ?work wdt:P345 ?i. }
  OPTIONAL { ?work wikibase:sitelinks ?n. }
  OPTIONAL { ?work rdfs:label ?en. FILTER(LANG(?en) = "en") }
  OPTIONAL { ?work rdfs:label ?ml. FILTER(LANG(?ml) = "mul") }
  OPTIONAL { ?wart schema:about ?work; schema:isPartOf <https://en.wikipedia.org/>. }
  # How many better-known people share the cast: a lead role ranks above a cameo.
  OPTIONAL { SELECT ?work (COUNT(DISTINCT ?o) AS ?a) WHERE {
    ?work wdt:P161 wd:${item}. wd:${item} wikibase:sitelinks ?mine.
    ?work wdt:P161 ?o. ?o wikibase:sitelinks ?on. FILTER(?on > ?mine)
  } GROUP BY ?work }
} GROUP BY ?work LIMIT 400`;
}

/**
 * A person from personInfoQuery's and personWorksQuery's answers: { id, name, about, photo, born,
 * wiki, titles }, titles as [{ id, name, year, kind: 'film'|'show', tmdb, imdb, fame }], best known first.
 */
export function parsePerson(info, works, item = '') {
  const first = info?.results?.bindings?.[0];
  if (!first) return null;
  const seen = new Set();
  const titles = (works?.results?.bindings ?? []).map((row) => {
    const tv = value(row, 'tmdbtv');
    const year = Number(value(row, 'date').slice(0, 4));
    return {
      id: itemId(value(row, 'work')),
      name: realName(value(row, 'workLabel')) || realName(value(row, 'mulLabel')),
      year: year > 1880 ? year : 0,
      kind: tv ? 'show' : 'film',
      tmdb: tv || value(row, 'tmdbm'),
      imdb: /^tt\d+$/.test(value(row, 'imdb')) ? value(row, 'imdb') : '',
      wiki: value(row, 'article') ? decodeURIComponent(value(row, 'article').split('/wiki/')[1] || '') : '',
      // Known on Wikipedia, less so when bigger names lead the cast.
      fame: Number(value(row, 'links') || 0) / Math.sqrt(1 + Number(value(row, 'above') || 0)),
    };
  }).filter((title) => title.id && title.name && /^\d+$/.test(title.tmdb))
    .sort((a, b) => b.fame - a.fame)
    // One entry per TMDB title (Wikidata sometimes has a cut or a re-release as its own item).
    .filter((title) => { const key = `${title.kind}:${title.tmdb}`; if (seen.has(key)) return false; seen.add(key); return true; });
  const art = value(first, 'art');
  return {
    id: item,
    name: realName(value(first, 'pLabel')),
    about: value(first, 'pDescription'),
    photo: commonsThumb(value(first, 'img'), 320),
    born: Number(value(first, 'born').slice(0, 4)) || 0,
    wiki: art ? decodeURIComponent(art.split('/wiki/')[1] || '') : '',
    titles,
  };
}

/** The opening paragraphs of a Wikipedia page, as plain text: the address. */
export const wikiIntroUrl = (page) => `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&redirects=1&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(String(page).replace(/_/g, ' '))}`;
export const parseIntro = (answer) => String(answer?.query?.pages?.[0]?.extract || '');

/** "Pirates of the Caribbean: Dead Man's Chest" → "pirates of the caribbean": one per franchise in Known for. */
const franchise = (name) => String(name).split(/:| – | - /)[0].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where a title is first named in a person's Wikipedia intro, or -1; a "minor role" or cameo doesn't count. */
function mentionAt(intro, name) {
  for (const form of [...new Set([name, name.split(/:| – /)[0].trim()])]) {
    if (form.length < 3) continue;
    const found = new RegExp(`(^|[^\\w])${escape(form)}(?![\\w])`).exec(intro);
    if (!found) continue;
    const before = intro.slice(Math.max(0, found.index - 45), found.index);
    if (/\b(minor|small|brief|cameo|uncredited|voice)\b/i.test(before)) return -1;
    return found.index;
  }
  return -1;
}

/**
 * Known for: the titles a person's Wikipedia intro names as their work (the intro is written
 * around their defining roles), one per franchise, best known first, filled up to 6 by fame.
 * Then the rest, newest first (max total). Without an intro, fame alone.
 */
export function knownFor(titles, intro = '', max = 24) {
  const named = intro ? titles.filter((title) => mentionAt(intro, title.name) >= 0) : [];
  const known = [];
  const groups = new Set();
  for (const title of [...named, ...titles]) {
    if (known.length >= 6) break;
    const group = franchise(title.name);
    if (known.includes(title) || groups.has(group)) continue;
    groups.add(group);
    known.push(title);
  }
  const rest = titles.filter((title) => !known.includes(title)).sort((a, b) => b.year - a.year);
  return { known, more: rest.slice(0, Math.max(0, max - known.length)) };
}

/** Where a title plays in Atlantic: films by TMDB number, shows from S1 E1. */
export function atlanticLink(title) {
  if (!title?.tmdb || !/^\d+$/.test(title.tmdb)) return '';
  return title.kind === 'film' ? `https://atlantic.bz/movie/${title.tmdb}` : `https://atlantic.bz/watch/${title.tmdb}/1/1`;
}

/** The TMDB number and kind in an Atlantic link: /movie/693134 → film; /watch/95396/1/1 → show. */
export function atlanticTitle(input) {
  const text = String(input || '');
  if (!/atlantic\.bz/i.test(text)) return null;
  const film = text.match(/\/movie\/(\d+)/);
  if (film) return { kind: 'film', tmdb: film[1] };
  const show = text.match(/\/(?:watch|tv)\/(\d+)/);
  return show ? { kind: 'show', tmdb: show[1] } : null;
}

/** "2 hr 45 min". */
export function runtimeText(minutes) {
  if (!minutes) return '';
  const hours = Math.floor(minutes / 60);
  return [hours ? `${hours} hr` : '', minutes % 60 ? `${minutes % 60} min` : ''].filter(Boolean).join(' ');
}

/** Wikipedia's summary of a page (story text and picture): the address. */
export const wikiSummaryUrl = (page) => `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(page).replace(/ /g, '_'))}`;

/** From Wikipedia's summary: { text, image }. */
export function parseSummary(answer) {
  if (!answer || answer.type === 'disambiguation') return { text: '', image: '' };
  return { text: String(answer.extract || '').trim(), image: answer.thumbnail?.source || answer.originalimage?.source || '' };
}

/** One Wikipedia request for the lead picture (a poster, for films and shows) of up to 50 pages. */
export const wikiImagesUrl = (pages, size = 240) => `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&redirects=1&prop=pageimages&piprop=thumbnail&pilicense=any&pithumbsize=${size}&titles=${encodeURIComponent(pages.slice(0, 50).map((page) => String(page).replace(/_/g, ' ')).join('|'))}`;

/** From wikiImagesUrl's answer: Map of the page name as asked (underscores) → picture address. */
export function parseWikiImages(answer) {
  const query = answer?.query ?? {};
  const byTitle = new Map((query.pages ?? []).filter((page) => page.thumbnail?.source).map((page) => [page.title, page.thumbnail.source]));
  for (const step of [...(query.normalized ?? []), ...(query.redirects ?? [])]) if (byTitle.has(step.to)) byTitle.set(step.from, byTitle.get(step.to));
  return new Map([...byTitle].map(([title, image]) => [title.replace(/ /g, '_'), image]));
}

/** The show with this TMDB TV number, as a Wikidata item (for its cast), from Atlantic shows. */
export const showByTmdbQuery = (tmdb) => `SELECT ?s WHERE { ?s wdt:P4983 ${quote(tmdb)}. } LIMIT 1`;
export const parseShowId = (answer) => itemId(value(answer?.results?.bindings?.[0], 's'));
