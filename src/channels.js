// The live channel directory: public playlists grouped by kind, parsed into names, logos
// and addresses. Only https feeds that don't demand extra headers are kept, because those
// are the ones a page can actually play.

export const CHANNEL_CATEGORIES = [
  { id: 'news', name: 'News', url: 'https://iptv-org.github.io/iptv/categories/news.m3u' },
  { id: 'sports', name: 'Sports', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
  { id: 'entertainment', name: 'Entertainment', url: 'https://iptv-org.github.io/iptv/categories/entertainment.m3u' },
  { id: 'movies', name: 'Movies', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u' },
  { id: 'music', name: 'Music', url: 'https://iptv-org.github.io/iptv/categories/music.m3u' },
  { id: 'us', name: 'US', url: 'https://iptv-org.github.io/iptv/countries/us.m3u' },
  { id: 'ca', name: 'Canada', url: 'https://iptv-org.github.io/iptv/countries/ca.m3u' },
];

const ATTRIBUTE = /([\w-]+)="([^"]*)"/g;

/** One entry per playable channel, A to Z. */
export function parseChannelList(text) {
  const lines = String(text || '').split(/\r?\n/);
  const found = [];
  const seen = new Set();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.startsWith('#EXTINF')) continue;
    const info = line.slice(line.indexOf(':') + 1);
    const attributes = {};
    for (const match of info.matchAll(ATTRIBUTE)) attributes[match[1]] = match[2];
    const name = (attributes['tvg-name'] || info.split(',').slice(1).join(',') || '').trim();
    let next = index + 1;
    let locked = false;
    while (next < lines.length && lines[next].startsWith('#')) {
      if (lines[next].startsWith('#EXTVLCOPT')) locked = true;
      next++;
    }
    const url = (lines[next] || '').trim();
    index = next;
    // Mixed content and header-locked feeds can't play from the site.
    if (locked || !/^https:\/\//i.test(url)) continue;
    // Pluto's short links send the channel with a referrer the player can't give.
    if (/^https:\/\/jmp2\.uk\//i.test(url)) continue;
    if (!name || seen.has(url)) continue;
    seen.add(url);
    const logo = /^https:\/\//i.test(attributes['tvg-logo'] || '') ? attributes['tvg-logo'] : '';
    found.push({ name, url, logo, group: attributes['group-title'] || '' });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
}

/** Directory names carry quality and notes; a favourite title is clean and uppercase. */
export function channelTitle(name) {
  return String(name || '')
    .replace(/\s*\(\d{3,4}p\)\s*/i, ' ')
    .replace(/\s*\[[^\]]*\]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase();
}

// A few public channels are listed by iptv-org only over plain http, which a secure page
// can't play. These are the same feeds over https, kept here so the finder can offer them.
export const CHANNEL_EXTRAS = [
  {
    category: 'sports',
    name: 'USA Network (720p)',
    url: 'https://tvsen6.aynaott.com/usa/index.m3u8',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/USA_Network_logo_%282016%29.svg/960px-USA_Network_logo_%282016%29.svg.png',
    group: 'Entertainment;Sports',
  },
];

const byChannelName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

/** Adds the hand-kept https feeds to one directory kind. */
export function withChannelExtras(categoryId, list) {
  const seen = new Set(list.map((item) => item.url));
  const extras = CHANNEL_EXTRAS
    .filter((item) => item.category === categoryId && !seen.has(item.url))
    .map(({ category, ...item }) => item);
  return extras.length ? [...list, ...extras].sort(byChannelName) : list;
}

const cleanChannel = (name) => channelTitle(name)
  .replace(/\b(CHANNEL|NETWORK|EAST|WEST|HD|SD|LIVE)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Whether a favourite's name means the same channel as a directory entry. */
export function channelMatches(a, b) {
  const left = cleanChannel(a);
  const right = cleanChannel(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return Math.min(left.length, right.length) >= 4 && (left.startsWith(right) || right.startsWith(left));
}

/** A hand-kept direct feed for a channel name, if there is one. */
export function extraFeedFor(name) {
  return CHANNEL_EXTRAS.find((item) => channelMatches(item.name, name)) || null;
}

// NBA team codes used by the sports embed sites. Other leagues fall back to the code.
const NBA_TEAMS = {
  ATL: 'Hawks', BOS: 'Celtics', BKN: 'Nets', CHA: 'Hornets', CHI: 'Bulls', CLE: 'Cavaliers',
  DAL: 'Mavericks', DEN: 'Nuggets', DET: 'Pistons', GSW: 'Warriors', GS: 'Warriors', HOU: 'Rockets',
  IND: 'Pacers', LAC: 'Clippers', LAL: 'Lakers', MEM: 'Grizzlies', MIA: 'Heat', MIL: 'Bucks',
  MIN: 'Timberwolves', NOP: 'Pelicans', NO: 'Pelicans', NYK: 'Knicks', NY: 'Knicks', OKC: 'Thunder',
  ORL: 'Magic', PHI: '76ers', PHX: 'Suns', PHO: 'Suns', POR: 'Trail Blazers', SAC: 'Kings',
  SAS: 'Spurs', SA: 'Spurs', TOR: 'Raptors', UTA: 'Jazz', UTH: 'Jazz', WAS: 'Wizards', WSH: 'Wizards',
};
const EVENT_LEAGUES = { nba: 'NBA', wnba: 'WNBA', nfl: 'NFL', nhl: 'NHL', mlb: 'MLB', ucl: 'Champions League', soccer: 'Soccer' };

/** "Raptors at Pistons" from an event URL such as .../nba/2026-11-20/tor-det. */
export function eventLabelFor(raw) {
  let text = String(raw || '').trim();
  const iframe = text.match(/<iframe\b[^>]*\bsrc=["']([^"']+)/i);
  if (iframe) text = iframe[1];
  let url;
  try { url = new URL(text); } catch { return ''; }
  const parts = url.pathname.split('/').filter(Boolean);
  const at = parts.findIndex((part) => /^\d{4}-\d{2}-\d{2}$/.test(part));
  if (at < 1) return '';
  const league = EVENT_LEAGUES[parts[at - 1].toLowerCase()];
  if (!league) return '';
  const [away, home] = (parts[at + 1] || '').split('-');
  if (!away || !home) return '';
  const team = (code) => (league === 'NBA' ? NBA_TEAMS[code.toUpperCase()] : '') || code.toUpperCase();
  const date = new Date(`${parts[at]}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${league} · ${date} · ${team(away)} at ${team(home)}`;
}

/** Searchable text for a saved web stream: its name plus the event in its URL. */
export function webStreamSearch(item) {
  const event = eventLabelFor(item?.input);
  return [item?.name, item?.group, event].filter(Boolean).join(' ').toLocaleLowerCase();
}
