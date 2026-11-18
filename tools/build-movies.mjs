// Makes movies.json for Today's "Movies this week": films released from 7 days ago to 7 days
// ahead, in cinemas or straight onto a streaming service. No keys or accounts:
//   - the releases come from Wikipedia's "List of American films of <year>",
//   - the 8 shown are the ones most viewed on Wikipedia this week,
//   - trailers come from Wikidata (the film's official YouTube video), or else a YouTube search
//     whose top result is checked to really be that film's trailer.
// Run by .github/workflows/guide.yml.   node tools/build-movies.mjs

import { writeFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';

const UA = 'MULTIGRID-movies/1.0 (personal TV app; github.com/thisiseames/multigrid)';
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const SHOWN = 8;
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
// A film whose studio list names one of these went straight to that service; anything else is a cinema release.
const SERVICES = [
  [/\bNetflix\b/i, 'Netflix'], [/Disney\+/i, 'Disney+'], [/Prime Video/i, 'Prime Video'], [/Apple TV\+?(?! Original)/i, 'Apple TV+'],
  [/\bHulu\b/i, 'Hulu'], [/Peacock/i, 'Peacock'], [/Paramount\+/i, 'Paramount+'], [/\bHBO Max\b|^Max\b|\/ Max\b/i, 'Max'], [/\bCrave\b/i, 'Crave'], [/\bTubi\b/i, 'Tubi'],
];

const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function getJSON(url, headers = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(20000) });
      if (response.ok) return response.json();
      if (response.status === 404) return null;
      console.warn(`${response.status} ${url.slice(0, 120)}`);
      // "Too many requests": Wikimedia asks for a slower pace, so wait properly before trying again.
      if (response.status === 429) { await pause(6000 * attempt); continue; }
    } catch (error) {
      console.warn(`${error.message} ${url.slice(0, 120)}`);
    }
    await pause(1500 * attempt);
  }
  return null;
}

const iso = (date) => date.toISOString().slice(0, 10);
const now = new Date();
const from = new Date(now.getTime() - 7 * 86400000);
const to = new Date(now.getTime() + 7 * 86400000);

/** Every film row in one year's list: { date, page, title, studios }. Handles the merged date cells. */
async function filmsOf(year) {
  const api = 'https://en.wikipedia.org/w/api.php?format=json&formatversion=2';
  const page = `List_of_American_films_of_${year}`;
  const info = await getJSON(`${api}&action=parse&prop=sections&page=${page}`);
  const sections = info?.parse?.sections ?? [];
  const films = [];
  for (const section of sections.filter((item) => /January|April|July|October/.test(item.line))) {
    await pause(500);
    const data = await getJSON(`${api}&action=parse&prop=text&page=${page}&section=${section.index}`);
    const { document } = parseHTML(`<div>${data?.parse?.text ?? ''}</div>`);
    for (const table of document.querySelectorAll('table.wikitable')) {
      const carry = []; // column -> { cell, left } for cells spanning several rows
      let month = '';
      let day = '';
      for (const row of table.querySelectorAll('tr')) {
        const own = [...row.children].filter((cell) => /^(TD|TH)$/.test(cell.tagName));
        if (!own.length || row.querySelector('th[scope="col"]')) continue;
        const cells = [];
        let column = 0;
        let next = 0;
        while (next < own.length || carry.slice(column).some((item) => item?.left > 0)) {
          if (carry[column]?.left > 0) {
            cells.push(carry[column].cell);
            carry[column].left -= 1;
          } else if (next < own.length) {
            const cell = own[next++];
            cells.push(cell);
            const span = Number(cell.getAttribute('rowspan')) || 1;
            carry[column] = span > 1 ? { cell, left: span - 1 } : null;
          } else break;
          column += 1;
        }
        // Columns: month, day, title, studios, cast.
        const text = (cell) => (cell?.textContent ?? '').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
        const monthText = text(cells[0]).toUpperCase().replace(/\s/g, '');
        if (MONTHS.includes(monthText)) month = monthText;
        if (/^\d{1,2}$/.test(text(cells[1]))) day = text(cells[1]);
        const titleCell = cells[2];
        const link = titleCell?.querySelector('a[href^="/wiki/"]');
        if (!month || !day || !titleCell || !link) continue;
        const date = `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
        films.push({
          date,
          page: decodeURIComponent(link.getAttribute('href').slice(6)).replace(/_/g, ' '),
          title: text(titleCell),
          studios: text(cells[3]),
        });
      }
    }
  }
  return films;
}

const years = [...new Set([from.getUTCFullYear(), to.getUTCFullYear()])];
const all = (await Promise.all(years.map(filmsOf))).flat();
const week = all.filter((film) => film.date >= iso(from) && film.date <= iso(to));
if (!week.length) {
  console.error(`No films found between ${iso(from)} and ${iso(to)}, so movies.json was left as it was.`);
  process.exit(0);
}

// Which are people looking at: Wikipedia views over the last 7 days.
const span = (date) => iso(date).replace(/-/g, '');
for (const film of week) {
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(film.page.replace(/ /g, '_'))}/daily/${span(from)}/${span(now)}`;
  const data = await getJSON(url);
  film.views = (data?.items ?? []).reduce((sum, item) => sum + item.views, 0);
  await pause(1000);
}
await pause(1500);
const top = week.sort((a, b) => b.views - a.views).slice(0, SHOWN);

// Posters (the article's lead image) and each film's Wikidata item, in one ask.
const titles = top.map((film) => film.page).join('|');
const props = await getJSON(`https://en.wikipedia.org/w/api.php?format=json&formatversion=2&action=query&redirects=1&prop=pageimages|pageprops&piprop=thumbnail&pithumbsize=160&pilicense=any&ppprop=wikibase_item&titles=${encodeURIComponent(titles)}`);
const byTitle = new Map();
for (const page of props?.query?.pages ?? []) byTitle.set(page.title, page);
for (const step of props?.query?.redirects ?? []) if (byTitle.has(step.to)) byTitle.set(step.from, byTitle.get(step.to));
for (const step of props?.query?.normalized ?? []) if (byTitle.has(step.to)) byTitle.set(step.from, byTitle.get(step.to));

/** The official trailer from Wikidata (property P1651, YouTube video ID), or ''. */
async function wikidataTrailer(item) {
  if (!item) return '';
  const data = await getJSON(`https://www.wikidata.org/wiki/Special:EntityData/${item}.json`);
  const claims = data?.entities?.[item]?.claims?.P1651 ?? [];
  return claims.map((claim) => claim.mainsnak?.datavalue?.value).find((id) => /^[\w-]{11}$/.test(id ?? '')) ?? '';
}

const words = (text) => text.toLowerCase().normalize('NFKD').replace(/[^\w\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2);
/** A YouTube search's top result, used only if its title says trailer and names the film. */
async function searchTrailer(film) {
  try {
    const query = encodeURIComponent(`${film.title} ${film.date.slice(0, 4)} official trailer`);
    const response = await fetch(`https://www.youtube.com/results?search_query=${query}&hl=en&gl=CA`, { headers: { 'User-Agent': BROWSER, 'Accept-Language': 'en-US' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) return '';
    const ids = [...new Set([...(await response.text()).matchAll(/"videoId":"([\w-]{11})"/g)].map((match) => match[1]))].slice(0, 4);
    const need = words(film.title).slice(0, 3);
    const fits = [];
    for (const id of ids) {
      const info = await getJSON(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
      const name = (info?.title ?? '').toLowerCase();
      if (/trailer|teaser/.test(name) && need.every((word) => words(name).includes(word))) fits.push({ id, official: /official/.test(name) });
    }
    // An official upload beats a fan channel's copy.
    return (fits.find((fit) => fit.official) ?? fits[0])?.id ?? '';
  } catch {
    // No trailer: tapping opens the film's Wikipedia page instead.
  }
  return '';
}

const items = [];
let fromWikidata = 0;
let fromSearch = 0;
for (const film of top) {
  const page = byTitle.get(film.page);
  let trailer = await wikidataTrailer(page?.pageprops?.wikibase_item);
  if (trailer) fromWikidata += 1;
  else {
    trailer = await searchTrailer(film);
    if (trailer) fromSearch += 1;
  }
  const service = SERVICES.find(([pattern]) => pattern.test(film.studios))?.[1] ?? '';
  items.push({
    title: film.title,
    page: film.page,
    date: film.date,
    kind: service ? 'streaming' : 'cinema',
    service,
    poster: page?.thumbnail?.source ?? '',
    trailer,
  });
  await pause(300);
}

writeFileSync(new URL('../movies.json', import.meta.url), JSON.stringify({ updated: Math.floor(Date.now() / 1000), from: iso(from), to: iso(to), items }));
console.log(`movies.json: ${items.length} of ${week.length} films this fortnight; trailers ${fromWikidata} from Wikidata, ${fromSearch} from YouTube search, ${items.length - fromWikidata - fromSearch} without.`);
for (const item of items) console.log(`  ${item.date} ${item.kind === 'cinema' ? 'cinemas' : item.service} · ${item.title} · ${item.trailer || 'no trailer'} · ${item.poster ? 'poster' : 'no poster'}`);
