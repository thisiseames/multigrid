// Fixtures, live scores and results from ESPN's public feed, which any page may read.
// The feed refuses date ranges for soccer but accepts a whole month, so each league asks
// for this month and next.

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
export const MY_TEAMS = ['Manchester United', '49ers', 'Raptors'];

export const TABS = [
  { id: 'mine', name: 'My teams', mine: true },
  { id: 'pl', name: 'Premier League', path: 'soccer/eng.1' },
  { id: 'laliga', name: 'LaLiga', path: 'soccer/esp.1' },
  { id: 'ucl', name: 'Champions League', path: 'soccer/uefa.champions' },
  { id: 'unl', name: 'Nations League', path: 'soccer/uefa.nations' },
  { id: 'niners', name: '49ers', team: { path: 'football/nfl', id: 'sf', league: 'NFL' } },
  { id: 'raptors', name: 'Raptors', team: { path: 'basketball/nba', id: 'tor', league: 'NBA' } },
];

const DAY = 86400000;
const getJSON = (url) => fetch(url, { cache: 'no-store', signal: AbortSignal.timeout?.(10000) })
  .then((response) => {
    if (!response.ok) throw new Error(`ESPN answered ${response.status}`);
    return response.json();
  });

const scoreOf = (competitor) => {
  const raw = competitor?.score;
  const text = typeof raw === 'object' && raw ? raw.displayValue : raw;
  return text == null || text === '' ? '' : String(text);
};

function side(competitor) {
  const team = competitor?.team ?? {};
  return {
    name: team.shortDisplayName || team.displayName || team.name || '?',
    full: team.displayName || team.name || '',
    id: String(team.id ?? ''),
    score: scoreOf(competitor),
    winner: Boolean(competitor?.winner),
  };
}

/** One game, the same shape whichever ESPN feed it came from. */
export function toMatch(event, league = '') {
  const game = event.competitions?.[0] ?? {};
  const status = game.status?.type ?? event.status?.type ?? {};
  const competitors = game.competitors ?? [];
  const home = competitors.find((item) => item.homeAway === 'home') ?? competitors[0];
  const away = competitors.find((item) => item.homeAway === 'away') ?? competitors[1];
  const tv = [];
  for (const broadcast of game.broadcasts ?? []) {
    for (const name of broadcast.names ?? []) tv.push(name);
    if (broadcast.media?.shortName) tv.push(broadcast.media.shortName);
  }
  return {
    id: String(event.id ?? ''),
    start: Date.parse(event.date || game.date || ''),
    league: league || event.league?.abbreviation || '',
    state: status.state || 'pre',
    detail: status.shortDetail || status.detail || '',
    home: side(home),
    away: side(away),
    tv: [...new Set(tv.filter(Boolean))],
  };
}

const monthKey = (time) => {
  const date = new Date(time);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
};

/** Yesterday through the next two weeks, oldest first. */
export function inWindow(matches, now = Date.now()) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const from = midnight.getTime() - DAY;
  const to = now + 14 * DAY;
  return matches.filter((match) => Number.isFinite(match.start) && match.start >= from && match.start <= to)
    .sort((a, b) => a.start - b.start);
}

const unique = (matches) => [...new Map(matches.map((match) => [match.id || `${match.start}${match.home.name}`, match])).values()];

async function leagueMatches(path, name, now = Date.now()) {
  const months = [...new Set([monthKey(now - DAY), monthKey(now), monthKey(now + 14 * DAY)])];
  const answers = await Promise.all(months.map((month) => getJSON(`${SITE}/${path}/scoreboard?dates=${month}&limit=300`)));
  return unique(answers.flatMap((answer) => (answer.events ?? []).map((event) => toMatch(event, name))));
}

async function teamMatches({ path, id, league }) {
  // A team's schedule has no live scores, so today's scoreboard fills them in.
  const [schedule, today] = await Promise.all([
    getJSON(`${SITE}/${path}/teams/${id}/schedule`),
    getJSON(`${SITE}/${path}/scoreboard`).catch(() => ({ events: [] })),
  ]);
  const live = new Map((today.events ?? []).map((event) => [String(event.id), toMatch(event, league)]));
  return (schedule.events ?? []).map((event) => {
    const match = toMatch(event, league);
    const fresh = live.get(match.id);
    return fresh ? { ...match, state: fresh.state, detail: fresh.detail, home: fresh.home, away: fresh.away, tv: match.tv.length ? match.tv : fresh.tv } : match;
  });
}

async function manUnitedMatches(now = Date.now()) {
  const [played, ahead, europe] = await Promise.all([
    getJSON(`${SITE}/soccer/all/teams/360/schedule`).catch(() => ({ events: [] })),
    getJSON(`${SITE}/soccer/eng.1/teams/360/schedule?fixture=true`).catch(() => ({ events: [] })),
    leagueMatches('soccer/uefa.champions', 'UCL', now).catch(() => []),
  ]);
  const all = [
    ...(played.events ?? []).map((event) => toMatch(event)),
    ...(ahead.events ?? []).map((event) => toMatch(event, 'Premier League')),
    ...europe.filter((match) => match.home.id === '360' || match.away.id === '360'),
  ];
  return unique(all);
}

/** A team's last result and next three games. */
function lastAndNext(matches, now = Date.now()) {
  const sorted = matches.filter((match) => Number.isFinite(match.start)).sort((a, b) => a.start - b.start);
  const done = sorted.filter((match) => match.state === 'post');
  const live = sorted.filter((match) => match.state === 'in');
  const next = sorted.filter((match) => match.state === 'pre' && match.start > now - 4 * 3600000).slice(0, 3);
  return [...done.slice(-1), ...live, ...next];
}

/** What a tab shows: [{ title, matches }]. Days are grouped when it's drawn. */
export async function loadTab(tab, now = Date.now()) {
  if (tab.mine) {
    const [united, niners, raptors] = await Promise.all([
      manUnitedMatches(now).catch(() => null),
      teamMatches(TABS.find((item) => item.id === 'niners').team).catch(() => null),
      teamMatches(TABS.find((item) => item.id === 'raptors').team).catch(() => null),
    ]);
    const sections = [
      { title: 'Man United', matches: united },
      { title: '49ers', matches: niners },
      { title: 'Raptors', matches: raptors },
    ].filter((section) => section.matches).map((section) => ({ ...section, matches: lastAndNext(section.matches, now) }));
    if (!sections.length) throw new Error('No team answered');
    return sections;
  }
  const matches = tab.team ? await teamMatches(tab.team) : await leagueMatches(tab.path, tab.name, now);
  return [{ title: '', matches: inWindow(matches, now) }];
}

export const isMine = (side) => MY_TEAMS.some((name) => side.full.includes(name));
