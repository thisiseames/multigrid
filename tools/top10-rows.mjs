// Reading the two Top 10 sources for top10.json (see build-top10.mjs). Kept apart so the tests
// can check them without the network.

/**
 * Netflix's newest weekly Top 10 for one country and category ("TV" or "Films"), from its
 * all-weeks-countries.tsv: { week, entries: [{ rank, title, season, weeks }] }, or null.
 */
export function netflixWeek(tsv, country = 'CA', category = 'TV') {
  const lines = String(tsv || '').split(/\r?\n/);
  const head = (lines.shift() || '').split('\t');
  const col = (name) => head.indexOf(name);
  const at = { country: col('country_iso2'), week: col('week'), category: col('category'), rank: col('weekly_rank'), title: col('show_title'), season: col('season_title'), weeks: col('cumulative_weeks_in_top_10') };
  if (Object.values(at).some((index) => index < 0)) return null;
  let week = '';
  const rows = [];
  for (const line of lines) {
    const cells = line.split('\t');
    if (cells[at.country] !== country || cells[at.category] !== category) continue;
    const day = cells[at.week];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < week) continue;
    if (day > week) { week = day; rows.length = 0; }
    rows.push(cells);
  }
  if (!rows.length) return null;
  const entries = rows.map((cells) => {
    const title = cells[at.title].trim();
    const seasonTitle = cells[at.season].trim();
    // "Black Doves: Season 2" → "Season 2"; "N/A" (films) or a repeat of the title → nothing.
    let season = seasonTitle && seasonTitle !== 'N/A' && seasonTitle !== title ? seasonTitle : '';
    if (season.startsWith(`${title}: `)) season = season.slice(title.length + 2);
    if (season === title) season = '';
    return { rank: Number(cells[at.rank]), title, season, weeks: Number(cells[at.weeks]) || 1 };
  }).filter((entry) => Number.isInteger(entry.rank) && entry.title).sort((a, b) => a.rank - b.rank);
  return { week, entries };
}

// Add-on channels sold through another store are the same service; the service's own offer wins.
const RESOLD = /amazon channel|apple tv channel|roku premium channel|on prime video/i;

/** "Paramount Plus Basic with Ads" → "Paramount+"; "Crave Amazon Channel" → "Crave". */
export function serviceName(name) {
  let clean = String(name || '').replace(/\s+(amazon channel|apple tv channel|roku premium channel)$/i, '').replace(/\s+(basic|standard|premium|total)?\s*with ads$/i, '').replace(/\s+(basic|standard|premium|total)$/i, '').trim();
  clean = clean.replace(/^(paramount|disney)\s*plus$/i, (_, brand) => `${brand[0].toUpperCase()}${brand.slice(1).toLowerCase()}+`);
  if (/^apple tv( plus|\+)?$/i.test(clean)) clean = 'Apple TV';
  if (/^amazon prime video$/i.test(clean)) clean = 'Prime Video';
  return clean;
}

const decode = (text) => String(text || '').replace(/&amp;/g, '&');

/**
 * JustWatch's popular titles (the answer to its popularTitles question), as
 * [{ rank, title, kind, year, service, url, image, desc }]. `service` is where it streams
 * (with or without ads, in the subscription), '' when it can only be bought or rented;
 * `url` opens it there, or JustWatch's page when it isn't streaming anywhere.
 */
export function justWatchTitles(answer) {
  const edges = answer?.data?.popularTitles?.edges;
  if (!Array.isArray(edges)) return [];
  return edges.map(({ node }, index) => {
    const content = node?.content ?? {};
    const offers = (Array.isArray(node?.offers) ? node.offers : []).filter((offer) => ['FLATRATE', 'FREE', 'ADS'].includes(offer?.monetizationType) && offer.package?.clearName);
    const offer = offers.find((one) => !RESOLD.test(one.package.clearName)) ?? offers[0];
    const backdrop = content.backdrops?.find((one) => one?.backdropUrl)?.backdropUrl;
    return {
      rank: index + 1,
      title: String(content.title || '').trim(),
      kind: node?.objectType === 'MOVIE' ? 'film' : 'show',
      year: Number(content.originalReleaseYear) || 0,
      service: offer ? serviceName(offer.package.clearName) : '',
      url: offer?.standardWebURL && /^https:\/\//.test(offer.standardWebURL) ? decode(offer.standardWebURL)
        : content.fullPath ? `https://www.justwatch.com${content.fullPath}` : '',
      image: backdrop ? `https://images.justwatch.com${backdrop.replace('{profile}', 's1440').replace('{format}', 'jpg')}` : '',
      desc: String(content.shortDescription || '').trim(),
    };
  }).filter((entry) => entry.title);
}

const plain = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * A Netflix Top 10 title in JustWatch's search answer (searched on Netflix only): its picture,
 * story and own Netflix page, as { image, desc, url }, or null. The same name wins; otherwise
 * the first result whose name holds every word of it ("Raw" is "WWE Raw").
 */
export function netflixMatch(answer, title) {
  const edges = answer?.data?.searchTitles?.edges;
  if (!Array.isArray(edges) || !plain(title)) return null;
  const want = plain(title);
  const nodes = edges.map((edge) => edge?.node).filter((node) => node?.content?.title);
  const node = nodes.find((one) => plain(one.content.title) === want)
    ?? nodes.slice(0, 1).find((one) => want.split(' ').every((word) => plain(one.content.title).split(' ').includes(word)));
  if (!node) return null;
  const backdrop = node.content.backdrops?.find((one) => one?.backdropUrl)?.backdropUrl;
  const page = (Array.isArray(node.offers) ? node.offers : [])
    .map((offer) => decode(offer?.standardWebURL))
    .find((url) => /^https:\/\/www\.netflix\.com\/title\/\d+/.test(url));
  return {
    image: backdrop ? `https://images.justwatch.com${backdrop.replace('{profile}', 's1440').replace('{format}', 'jpg')}` : '',
    desc: String(node.content.shortDescription || '').trim(),
    url: page || '',
  };
}
