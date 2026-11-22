// Ties a stream tile to the game it is showing, so a dead channel can be repaired by the
// game rather than by whatever the channel was called. Pure matching and grouping; the app
// supplies the ESPN, Matchora, PPV.st, Daddy Live, Guide, Catalogue and Zlive lists.

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const keyFor = (value) => clean(value)
  .toLocaleLowerCase()
  .normalize('NFKD')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

const MAX_SOURCES = 6;
const DAY = 86400000;

/** ESPN's short names, Matchora's full names and the Guide's abbreviations. */
const TEAM_ALIASES = {
  'man utd': 'manchester united',
  'man united': 'manchester united',
  'manchester utd': 'manchester united',
  'man city': 'manchester city',
  'manchester utd': 'manchester united',
  'spurs': 'tottenham',
  'tottenham hotspur': 'tottenham',
  'wolves': 'wolverhampton',
  'wolverhampton wanderers': 'wolverhampton',
  'newcastle': 'newcastle united',
  'nottm forest': 'nottingham forest',
  'sheff utd': 'sheffield united',
  'sheffield utd': 'sheffield united',
  'west ham': 'west ham united',
  'c palace': 'crystal palace',
  'brighton and hove albion': 'brighton',
  'brighton hove albion': 'brighton',
  'hull': 'hull city',
  'stoke': 'stoke city',
  'swansea': 'swansea city',
  'cardiff': 'cardiff city',
  'derby': 'derby county',
  'ipswich': 'ipswich town',
  'norwich': 'norwich city',
  'leeds': 'leeds united',
  'leicester': 'leicester city',
  'bournemouth': 'afc bournemouth',
  'west brom': 'west bromwich albion',
  'qpr': 'queens park rangers',
  'psg': 'paris saint germain',
  'bayern': 'bayern munich',
  'dortmund': 'borussia dortmund',
  'inter': 'internazionale',
  'ac milan': 'milan',
  'juve': 'juventus',
  'atletico': 'atletico madrid',
  'atleti': 'atletico madrid',
  'real': 'real madrid',
  'barca': 'barcelona',
  'sporting': 'sporting cp',
  'celtic': 'celtic',
  'rangers': 'rangers',
};

/** Display names for the channels that come back with odd feed suffixes. */
const CHANNEL_NAMES = {
  usanetwork: 'USA Network',
  telemundo: 'Telemundo',
  skysportsmainevent: 'Sky Sports Main Event',
  skysportspremierleague: 'Sky Sports Premier League',
  skysportsfootball: 'Sky Sports Football',
  skysportsnews: 'Sky Sports News',
  skysportsf1: 'Sky Sports F1',
  skysportsaction: 'Sky Sports Action',
  skysportscricket: 'Sky Sports Cricket',
  skysportsplus: 'Sky Sports Plus',
  skysportsarena: 'Sky Sports Arena',
  skysportsgolf: 'Sky Sports Golf',
  skysportsracing: 'Sky Sports Racing',
  skysportstennis: 'Sky Sports Tennis',
  skysportsmix: 'Sky Sports Mix',
};

const CHANNEL_ALIASES = {
  usanet: 'usanetwork',
  usanetworkeast: 'usanetwork',
  usanetworkwest: 'usanetwork',
  skysportmainevent: 'skysportsmainevent',
  skysportsmainevents: 'skysportsmainevent',
  skysportpremierleague: 'skysportspremierleague',
  skysportfootball: 'skysportsfootball',
  skysportnews: 'skysportsnews',
  skysportf1: 'skysportsf1',
  skysportaction: 'skysportsaction',
  skysportcricket: 'skysportscricket',
  skysportplus: 'skysportsplus',
  tele: 'telemundo',
};

/** "Sky Sports Main Event Backup", "USA Network East" and "TSN 4" all collapse to a channel. */
export function channelKey(raw) {
  let key = keyFor(String(raw ?? '').replace(/\+/g, ' plus ')).replace(/ /g, '');
  key = key.replace(/(?:backup|feed\d*|fhd|uhd|4k|hd|east|west|pacific)$/g, '');
  return CHANNEL_ALIASES[key] || key;
}

export function channelName(raw) {
  const key = channelKey(raw);
  return CHANNEL_NAMES[key] || clean(raw).replace(/\s+(?:backup|feed\s*\d+|fhd|uhd|4k|hd|east|west|pacific)$/i, '').trim();
}

/** "Sky Sports" is a family, not one channel. A family never auto-links by itself. */
export function channelFamily(raw) {
  const key = channelKey(raw);
  if (key.startsWith('skysports')) return 'skysports';
  return key;
}

export function teamKey(raw) {
  const key = keyFor(raw);
  return TEAM_ALIASES[key] || key;
}

const sameTeam = (a, b) => {
  const left = teamKey(a);
  const right = teamKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  // "Brighton" / "Brighton Hove Albion", "Hull" / "Hull City".
  return (left.length >= 5 && right.startsWith(`${left} `)) || (right.length >= 5 && left.startsWith(`${right} `));
};

/** "Liverpool vs Manchester United", "Liverpool v Man Utd", "Bucks at 76ers". */
export function splitTeams(raw) {
  let text = clean(raw);
  text = text.replace(/\s+v(?:s)?\.?\s+/i, ' vs ');
  let parts = text.split(/\s+vs\.?\s+/i);
  if (parts.length !== 2) {
    const at = text.match(/^(.{2,60}?)\s+at\s+(.{2,60})$/i);
    if (at) parts = [at[1], at[2]];
  }
  if (parts.length !== 2) {
    // Daddy Live writes "League: Hull City - Brighton & Hove Albion" or "Hull City x Brighton".
    const rest = text.includes(':') ? text.slice(text.indexOf(':') + 1) : text;
    const dash = rest.split(/\s+[-–—]\s+|\s+x\s+/i).map((part) => part.trim()).filter(Boolean);
    if (dash.length === 2 && dash.every((part) => part.length <= 60)) parts = dash;
  }
  if (parts.length !== 2) return [];
  const tidy = (part) => clean(part)
    .replace(/^.*?:\s*/, '')
    .replace(/^.*?\s+-\s+/, '')
    .replace(/^live\s+(?:pl|efl|ucl|nfl|nba|mlb|nhl)?\s*:?\s*/i, '')
    .trim();
  const [a, b] = parts.map(tidy);
  if (!a || !b || a.length > 80 || b.length > 80) return [];
  return [a, b];
}

export function eventTeams(event) {
  if (event?.home?.name && event?.away?.name) return [event.home.name, event.away.name];
  return splitTeams(event?.name || event?.label || '');
}

export const eventStart = (event) => Number(event?.starts ?? event?.start ?? 0) || 0;

const dayKey = (time) => {
  if (!time) return '';
  const date = new Date(time);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const sameStart = (a, b, minutes = 20) => {
  const left = eventStart(a);
  const right = eventStart(b);
  if (!left || !right) return true;
  return Math.abs(left - right) <= minutes * 60000;
};

const sameDay = (a, b) => {
  const left = eventStart(a);
  const right = eventStart(b);
  if (!left || !right) return true;
  return dayKey(left) === dayKey(right);
};

const samePair = (left, right) => {
  if (!left.length || !right.length) return false;
  if (left.length === 2 && right.length === 2) {
    return left.every((name) => right.some((other) => sameTeam(name, other)))
      && right.every((name) => left.some((other) => sameTeam(name, other)));
  }
  if (left.length === 1 && right.length === 1) return sameTeam(left[0], right[0]);
  return false;
};

const sameOneTeam = (left, right) => left.some((name) => right.some((other) => sameTeam(name, other)));

const SERIES = { soccer: 'soccer', football: 'football', basketball: 'basketball', baseball: 'baseball', hockey: 'hockey', tennis: 'tennis', cricket: 'cricket' };
const sportKey = (event) => {
  const text = keyFor(`${event?.sport || ''} ${event?.league || ''}`);
  for (const [needle, key] of Object.entries(SERIES)) if (text.includes(needle)) return key;
  return text;
};

/**
 * The same fixture from two providers. Two full team lists must match as a pair; one shared
 * team is not enough (Everton v Brighton and Hull v Brighton can kick off together). A name
 * with only one team (a player, say) can still match by that name and the start time.
 */
export function sameGame(left, right) {
  const a = eventTeams(left);
  const b = eventTeams(right);
  if (a.length === 2 && b.length === 2) return samePair(a, b) && sameStart(left, right);
  if (a.length === 1 && b.length === 1) return sameTeam(a[0], b[0]) && sameStart(left, right, 30);
  if (a.length && b.length && (a.length < 2 || b.length < 2) && sameStart(left, right, 10) && sameOneTeam(a, b)) {
    const sport = sportKey(left);
    const other = sportKey(right);
    if (!sport || !other || sport === other) return true;
  }
  return keyFor(left?.name || left?.label) === keyFor(right?.name || right?.label) && sameStart(left, right, 30);
}

/** Zlive's manifest URL and its clean player URL are the same feed, with different query strings. */
export function sourceIdentity(source) {
  if (!source) return '';
  if (source.input) {
    try {
      const url = new URL(source.input);
      url.search = '';
      url.hash = '';
      if (url.hostname.toLocaleLowerCase() === 'zlive.st') return url.href;
    } catch {}
    return source.input;
  }
  return source.kind === 'daddy' ? `daddy:${source.event?.name || source.name || ''}` : '';
}

const limitSources = (sources) => {
  const seen = new Set();
  const list = [];
  for (const source of sources ?? []) {
    const key = sourceIdentity(source);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    list.push(source);
    if (list.length >= MAX_SOURCES) break;
  }
  return list;
};

const addChannel = (game, raw, extra = {}) => {
  const name = channelName(raw);
  const key = channelKey(raw);
  if (!name || !key) return null;
  let channel = game.channels.find((item) => item.key === key);
  if (!channel) {
    channel = { key, name, aliases: [], sources: [] };
    game.channels.push(channel);
  }
  const text = clean(raw);
  if (text && !channel.aliases.some((alias) => keyFor(alias) === keyFor(text))) channel.aliases.push(text);
  if (extra.source) channel.sources.push(extra.source);
  return channel;
};

const gameFrom = (event, kind) => {
  const teams = eventTeams(event);
  const label = clean(event?.name || event?.label
    || (event?.home?.name && event?.away?.name ? `${event.home.name} vs ${event.away.name}` : ''));
  if (!label && !teams.length) return null;
  return {
    key: `${kind}:${event?.id || label || eventStart(event)}`,
    label: label || teams.join(' vs '),
    aliases: [label, ...teams].filter(Boolean),
    teams,
    starts: eventStart(event),
    live: Boolean(event?.live || event?.state === 'in'),
    state: event?.state || '',
    league: clean(event?.league || ''),
    sport: clean(event?.sport || ''),
    channels: [],
    sources: [],
    guide: [],
  };
};

const mergeInto = (games, event, kind, source = null) => {
  const found = games.find((game) => sameGame(game, event));
  const game = found || gameFrom(event, kind);
  if (!game) return null;
  if (!found) games.push(game);
  game.live = game.live || Boolean(event?.live || event?.state === 'in');
  game.starts = game.starts || eventStart(event);
  game.league = game.league || clean(event?.league || '');
  game.sport = game.sport || clean(event?.sport || '');
  const label = clean(event?.name || event?.label);
  if (label && !game.aliases.some((alias) => keyFor(alias) === keyFor(label))) game.aliases.push(label);
  for (const team of eventTeams(event)) {
    if (!game.teams.some((name) => sameTeam(name, team))) game.teams.push(team);
  }
  for (const channel of Array.isArray(event?.tv) ? event.tv : []) addChannel(game, channel);
  // Daddy Live's "channels" are link names, not TV channels.
  if (kind !== 'daddy') {
    for (const channel of Array.isArray(event?.channels) ? event.channels : []) {
      addChannel(game, typeof channel === 'string' ? channel : channel?.name);
    }
  }
  if (source) game.sources.push({ ...source, gameEvent: game.key });
  game.sources = limitSources(game.sources);
  return game;
};

/**
 * All games the app can name today, from ESPN, Matchora, PPV.st, Daddy Live and the Guide.
 * Matchora/PPV/Daddy events carry their playable input; ESPN games carry TV channel names.
 */
export function mergeGames({ sports = [], matchora = [], ppv = [], daddy = [], guide = [] } = {}) {
  const games = [];
  for (const event of Array.isArray(sports) ? sports : []) {
    if (!eventTeams(event).length) continue;
    mergeInto(games, event, 'sports');
  }
  for (const event of Array.isArray(matchora) ? matchora : []) {
    mergeInto(games, event, 'matchora', {
      kind: 'matchora',
      label: 'Matchora',
      name: clean(event?.name),
      input: event?.input,
      event,
    });
  }
  for (const event of Array.isArray(ppv) ? ppv : []) {
    mergeInto(games, event, 'ppv', {
      kind: 'ppv',
      label: 'PPV.st',
      name: clean(event?.name),
      input: event?.input,
      event,
    });
  }
  for (const event of Array.isArray(daddy) ? daddy : []) {
    mergeInto(games, event, 'daddy', {
      kind: 'daddy',
      label: 'Daddy Live',
      name: clean(event?.name),
      event,
    });
  }
  for (const row of Array.isArray(guide) ? guide : []) {
    const title = clean(row?.title);
    if (!title) continue;
    const show = { name: title, starts: Number(row?.start) || 0, live: Number(row?.start) <= Date.now() && Date.now() < Number(row?.end) };
    const teams = splitTeams(title);
    if (!teams.length) continue;
    show.name = teams.join(' vs ');
    const existing = games.find((game) => {
      const gameTeams = game.teams;
      return gameTeams.length === 2 && samePair(gameTeams, teams)
        && (!game.starts || !show.starts || Math.abs(game.starts - show.starts) < 6 * 3600000);
    });
    const game = existing || gameFrom(show, 'guide');
    if (!game) continue;
    if (!existing) games.push(game);
    addChannel(game, row.channel);
    game.guide.push({ channel: row.channel, title, start: Number(row.start) || 0, end: Number(row.end) || 0 });
    game.aliases.push(title, row.channel);
  }
  for (const game of games) {
    game.sources = limitSources(game.sources);
    game.channels = game.channels.filter((channel) => channel.key);
    game.aliases = [...new Set(game.aliases.map(clean).filter(Boolean))];
  }
  return games.sort((a, b) => (
    (a.live === b.live ? 0 : a.live ? -1 : 1)
    || (a.starts || Infinity) - (b.starts || Infinity)
    || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  ));
}

const sourceFromFavorite = (favorite) => ({
  kind: 'favorite',
  label: 'Favorite',
  name: clean(favorite?.name),
  input: favorite?.input,
  favorite,
});

const sourceFromChannel = (channel, kind) => ({
  kind,
  label: kind === 'catalog' ? 'Catalogue' : 'Zlive',
  name: clean(channel?.name),
  input: clean(channel?.url),
  category: clean(channel?.category),
  region: clean(channel?.country || channel?.region),
  quality: clean(channel?.quality),
  channel,
});

/** Every playable source the app has for one channel name. */
export function sourcesForChannel(channel, { favorites = [], catalog = [], zlive = [] } = {}) {
  const key = typeof channel === 'string' ? channelKey(channel) : channelKey(channel?.key || channel);
  if (!key) return [];
  const sources = [];
  for (const favorite of Array.isArray(favorites) ? favorites : []) {
    if (channelKey(favorite?.name) === key) sources.push(sourceFromFavorite(favorite));
  }
  for (const item of Array.isArray(catalog) ? catalog : []) {
    if (channelKey(item?.name) === key) sources.push(sourceFromChannel(item, 'catalog'));
  }
  for (const item of Array.isArray(zlive) ? zlive : []) {
    if (channelKey(item?.name) === key) sources.push(sourceFromChannel(item, 'zlive'));
  }
  return limitSources(sources);
}

/** A game's channels with playable sources, plus any provider that carries the game itself. */
export function resolveGameSources(game, data = {}) {
  const channels = [];
  for (const channel of game?.channels ?? []) {
    const sources = sourcesForChannel(channel, data);
    channels.push({ ...channel, sources });
  }
  const providers = limitSources(game?.sources ?? []);
  const alsoOn = channels.filter((channel) => !channel.sources.length);
  return { channels, providers, alsoOn };
}

/** Games whose channel name matches the query, including a family search like "Sky Sports". */
export function gamesForChannel(games, query, limit = 6) {
  const wanted = keyFor(query);
  if (!wanted) return [];
  const found = [];
  for (const game of Array.isArray(games) ? games : []) {
    const channel = (game?.channels ?? []).find((item) => {
      const key = item.key || channelKey(item.name);
      if (!key) return false;
      return key === wanted.replace(/ /g, '') || (wanted.replace(/ /g, '') === channelFamily(item.name) && key.startsWith(wanted.replace(/ /g, '')));
    });
    if (!channel) continue;
    found.push({ ...game, viaChannel: channel });
  }
  return found.slice(0, limit);
}

/** Live or starting in the next few hours, with the games that carry the most sources first. */
export function gamesOnNow(games, now = Date.now(), limit = 8) {
  return (Array.isArray(games) ? games : [])
    .filter((game) => game && (game.live || (game.starts && game.starts > now - 3 * 3600000 && game.starts < now + 8 * 3600000)))
    .sort((a, b) => (
      (a.live === b.live ? 0 : a.live ? -1 : 1)
      || (a.starts || Infinity) - (b.starts || Infinity)
      || (b.sources?.length || 0) - (a.sources?.length || 0)
    ))
    .slice(0, limit);
}

/** Find a game by the name a tile or a Guide show uses. */
export function gameForName(games, name) {
  const wanted = keyFor(name);
  if (!wanted) return null;
  const list = Array.isArray(games) ? games : [];
  const exact = list.find((game) => (
    keyFor(game.label) === wanted
    || (game.aliases ?? []).some((alias) => keyFor(alias) === wanted)
  ));
  if (exact) return exact;
  const teams = splitTeams(name);
  if (teams.length === 2) return list.find((game) => samePair(game.teams ?? [], teams)) || null;
  return null;
}

/** The actual channel from a Zlive or Catalogue address, when the address names it. */
export function channelFromInput(input, { catalog = [], zlive = [] } = {}) {
  let href = '';
  try {
    const url = new URL(String(input || ''));
    url.search = '';
    url.hash = '';
    href = url.href;
  } catch {
    return '';
  }
  const all = [...(Array.isArray(catalog) ? catalog : []), ...(Array.isArray(zlive) ? zlive : [])];
  for (const item of all) {
    let itemHref = '';
    try {
      const url = new URL(String(item?.url || ''));
      url.search = '';
      url.hash = '';
      itemHref = url.href;
    } catch {}
    if (itemHref && itemHref === href) return clean(item.name);
  }
  return '';
}

/**
 * The game a tile is most likely showing. Never guesses between two games; a family name
 * such as "Sky Sports" returns null so the picker can ask which channel/game.
 */
export function gameForTile({ name = '', input = '', games = [], guide = [], catalog = [], zlive = [] } = {}) {
  const byName = gameForName(games, name);
  if (byName) return byName;
  const channel = channelFromInput(input, { catalog, zlive }) || name;
  const key = channelKey(channel);
  if (!key) return null;
  if (channelFamily(channel) === 'skysports' && key === 'skysports') return null;
  const row = (Array.isArray(guide) ? guide : []).find((item) => channelKey(item?.channel) === key);
  if (row?.title) {
    const showGame = gameForName(games, row.title);
    if (showGame) return showGame;
    const showTeams = splitTeams(row.title);
    if (showTeams.length === 2) {
      const found = games.find((game) => samePair(game.teams, showTeams));
      if (found) return found;
    }
  }
  const now = Date.now();
  const candidates = games.filter((game) => (game.channels ?? []).some((item) => item.key === key))
    .filter((game) => game.live || (game.starts && game.starts > now - 3 * 3600000 && game.starts < now + 3 * 3600000));
  return candidates.length === 1 ? candidates[0] : null;
}

/** What a tile remembers about a game. It is small and safe to save until the game ends. */
export function gameLink(game) {
  if (!game) return null;
  return {
    key: clean(game.key),
    label: clean(game.label),
    starts: Number(game.starts) || 0,
  };
}

export { MAX_SOURCES, DAY };
