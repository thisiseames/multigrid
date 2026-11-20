// Fixtures, live scores and results from ESPN's public feed, which any page may read.
// The feed refuses date ranges for soccer but accepts a whole month, so each league asks
// for this month and next.

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
export const MY_TEAMS = ['Manchester United', '49ers', 'Raptors'];
// Team schedules leave out colours, so mine are written down.
const TEAM_COLORS = { 'Man United': '#da291c', '49ers': '#aa0000', Raptors: '#ce1141' };

// Team tabs are hidden: My teams covers them, but it reads their schedules from here.
export const TABS = [
  { id: 'mine', name: 'My teams', mine: true },
  { id: 'pl', name: 'Premier League', path: 'soccer/eng.1' },
  { id: 'laliga', name: 'LaLiga', path: 'soccer/esp.1' },
  { id: 'ucl', name: 'Champions League', path: 'soccer/uefa.champions' },
  { id: 'unl', name: 'Nations League', path: 'soccer/uefa.nations' },
  { id: 'united', name: 'Man United', united: true, hidden: true },
  { id: 'niners', name: '49ers', hidden: true, team: { path: 'football/nfl', id: 'sf', league: 'NFL' } },
  { id: 'raptors', name: 'Raptors', hidden: true, team: { path: 'basketball/nba', id: 'tor', league: 'NBA' } },
  { id: 'nba', name: 'NBA', path: 'basketball/nba' },
];

const DAY = 86400000;

/** "Bruno Fernandes" becomes "B. Fernandes", the way score apps fit names in. One-word names stay. */
export function shortName(name = '') {
  const parts = String(name).trim().split(/\s+/);
  return parts.length < 2 ? parts[0] || '' : `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

const positionOf = (player) => String(player?.position || '').toUpperCase();
const isGoalkeeper = (player) => /^(G|GK)$/.test(positionOf(player)) || player?.formationPlace === 1;

/** A rough back-to-front order for the positions ESPN uses. */
const lineRank = (player) => {
  const position = positionOf(player);
  if (isGoalkeeper(player)) return 0;
  // Wing-backs sit between the centre-backs and the midfield; in a back three they
  // belong in the five, not the three.
  if (/LWB|RWB|WB/.test(position)) return 1.5;
  if (/DM|CDM/.test(position)) return 2;
  if (/AM|CAM/.test(position)) return 3;
  if (/[BD]/.test(position)) return 1;
  if (/^(F|ST|CF|LW|RW|W|SS|WF|FW|LWF|RWF)$/.test(position) || /ST|CF|LW|RW|WF|SS/.test(position)) return 4;
  return 2.5;
};

const sideRank = (player) => {
  const position = positionOf(player);
  if (/CD-L|CB-L/.test(position)) return -0.6;
  if (/CD-R|CB-R/.test(position)) return 0.6;
  if (/AM-L|AML/.test(position)) return -0.8;
  if (/AM-R|AMR/.test(position)) return 0.8;
  if (/L/.test(position)) return -1;
  if (/R/.test(position)) return 1;
  return 0;
};

const comparePlayers = (a, b) => (sideRank(a) - sideRank(b))
  || ((a.formationPlace || 0) - (b.formationPlace || 0))
  || String(a.name || '').localeCompare(String(b.name || ''));

const playerOf = (entry) => {
  const athlete = entry?.athlete || {};
  const name = athlete.displayName || athlete.fullName || athlete.shortName || '?';
  const position = entry?.position?.abbreviation || entry?.position?.name || '';
  return {
    name,
    short: athlete.shortName || shortName(name),
    jersey: entry?.jersey != null ? String(entry.jersey) : '',
    // ESPN labels every substitute "SUB"; that is a bench tag, not a position.
    position: /^sub(stitute)?$/i.test(position) ? '' : position,
    formationPlace: Number(entry?.formationPlace) || 0,
    subbedIn: Boolean(entry?.subbedIn),
    subbedOut: Boolean(entry?.subbedOut),
  };
};

/** ESPN's two rosters, when the lineups have been posted. Empty until then. */
export function parseLineups(answer) {
  return (Array.isArray(answer?.rosters) ? answer.rosters : [])
    .map((side) => {
      const roster = (Array.isArray(side?.roster) ? side.roster : []).filter((item) => item?.athlete);
      const starters = roster.filter((item) => item.starter).map(playerOf);
      if (!starters.length) return null;
      return {
        home: side.homeAway === 'home',
        team: side.team?.displayName || '',
        formation: typeof side.formation === 'string' ? side.formation : '',
        starters,
        subs: roster.filter((item) => !item.starter).map(playerOf),
      };
    })
    .filter(Boolean);
}

/**
 * The formation's rows, goalkeeper first and attackers last. Positions decide the line;
 * the formation numbers decide how many go in each row.
 */
export function formationRows(formation, starters) {
  const list = (Array.isArray(starters) ? starters : []).filter(Boolean);
  const keeper = list.find(isGoalkeeper) || null;
  const outfield = list.filter((player) => player !== keeper);
  const counts = String(formation || '').split('-').map(Number).filter((count) => Number.isFinite(count) && count > 0);
  const exact = counts.length > 0 && counts.reduce((sum, count) => sum + count, 0) === outfield.length;
  let rows;
  if (exact) {
    const order = outfield.slice().sort((a, b) => (lineRank(a) - lineRank(b)) || comparePlayers(a, b));
    rows = [];
    let at = 0;
    for (const count of counts) {
      const row = order.slice(at, at + count).sort(comparePlayers);
      if (row.length) rows.push(row);
      at += count;
    }
  } else {
    const defenders = outfield.filter((player) => lineRank(player) <= 1.5).sort(comparePlayers);
    const midfield = outfield.filter((player) => lineRank(player) >= 2 && lineRank(player) <= 3).sort(comparePlayers);
    const forwards = outfield.filter((player) => lineRank(player) === 4).sort(comparePlayers);
    rows = [defenders, midfield, forwards].filter((row) => row.length);
  }
  if (keeper) rows.unshift([keeper]);
  return rows;
}

/** What a tapped game opens to: goals and cards for football, the score by quarter otherwise. */
export async function loadDetails(match) {
  const answer = await getJSON(`${SITE}/${match.sport}/summary?event=${encodeURIComponent(match.id)}`);
  const venue = answer.gameInfo?.venue?.fullName || match.venue;
  if (match.sport === 'soccer/all') {
    const list = [];
    for (const item of answer.keyEvents ?? []) {
      const text = item.type?.text || '';
      const kind = item.scoringPlay ? 'goal' : /red card/i.test(text) ? 'red' : /yellow card/i.test(text) ? 'yellow' : '';
      if (!kind) continue;
      list.push({
        kind,
        minute: item.clock?.displayValue || '',
        player: shortName(item.participants?.[0]?.athlete?.displayName || ''),
        note: /own goal/i.test(text) ? 'OG' : /penalty/i.test(text) ? 'pen' : '',
        home: String(item.team?.id ?? '') === match.home.id,
      });
    }
    return { venue, moments: list.length ? list : match.moments, lineups: parseLineups(answer) };
  }
  const sides = answer.header?.competitions?.[0]?.competitors ?? [];
  const lines = (where) => (sides.find((item) => item.homeAway === where)?.linescores ?? []).map((item) => item.displayValue ?? item.value ?? '');
  return { venue, periods: { home: lines('home'), away: lines('away') }, lineups: [] };
}
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

/** ESPN's crests are 500px; its image service hands back a small copy instead. */
export function crest(url, size = 56) {
  if (typeof url !== 'string' || !url.startsWith('https://a.espncdn.com/i/')) return url || '';
  return `https://a.espncdn.com/combiner/i?img=${url.slice('https://a.espncdn.com'.length)}&w=${size}&h=${size}`;
}

const hex = (value) => (/^[0-9a-f]{6}$/i.test(value || '') ? `#${value}` : '');

function side(competitor) {
  const team = competitor?.team ?? {};
  const record = competitor?.records?.[0]?.summary || competitor?.record?.[0]?.displayValue || '';
  return {
    name: team.shortDisplayName || team.displayName || team.name || '?',
    full: team.displayName || team.name || '',
    abbr: team.abbreviation || '',
    id: String(team.id ?? ''),
    logo: team.logo || team.logos?.[0]?.href || '',
    color: hex(team.color),
    record,
    score: scoreOf(competitor),
    winner: Boolean(competitor?.winner),
  };
}

/** Goals and cards, each with its minute, player and which side it was for. */
function moments(game, home) {
  const list = [];
  for (const item of game.details ?? []) {
    const text = item.type?.text || '';
    const kind = item.scoringPlay || /goal/i.test(text) ? 'goal' : /red card/i.test(text) ? 'red' : /yellow card/i.test(text) ? 'yellow' : '';
    if (!kind) continue;
    list.push({
      kind,
      minute: item.clock?.displayValue || '',
      player: item.athletesInvolved?.[0]?.shortName || shortName(item.athletesInvolved?.[0]?.displayName || ''),
      note: item.ownGoal ? 'OG' : item.penaltyKick ? 'pen' : '',
      home: String(item.team?.id ?? '') === home.id,
    });
  }
  return list;
}

/** One game, the same shape whichever ESPN feed it came from. */
export function toMatch(event, league = '', sport = 'soccer/all') {
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
  const homeSide = side(home);
  return {
    id: String(event.id ?? ''),
    start: Date.parse(event.date || game.date || ''),
    league: league || event.league?.abbreviation || '',
    state: status.state || 'pre',
    detail: status.shortDetail || status.detail || '',
    home: homeSide,
    away: side(away),
    tv: [...new Set(tv.filter(Boolean))],
    sport,
    venue: game.venue?.fullName || '',
    moments: moments(game, homeSide),
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
  return unique(answers.flatMap((answer) => (answer.events ?? []).map((event) => toMatch(event, name, path.startsWith('soccer') ? 'soccer/all' : path))));
}

async function teamMatches({ path, id, league }) {
  // A team's schedule has no live scores, so today's scoreboard fills them in.
  const [schedule, today] = await Promise.all([
    getJSON(`${SITE}/${path}/teams/${id}/schedule`),
    getJSON(`${SITE}/${path}/scoreboard`).catch(() => ({ events: [] })),
  ]);
  const live = new Map((today.events ?? []).map((event) => [String(event.id), toMatch(event, league, path)]));
  return (schedule.events ?? []).map((event) => {
    const match = toMatch(event, league, path);
    const fresh = live.get(match.id);
    return fresh ? { ...match, state: fresh.state, detail: fresh.detail, home: fresh.home, away: fresh.away, moments: fresh.moments, tv: match.tv.length ? match.tv : fresh.tv } : match;
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

/** How a finished game went for one of my teams: W, D or L. */
export function outcome(match) {
  const mine = isMine(match.home) ? match.home : isMine(match.away) ? match.away : null;
  if (!mine || match.state !== 'post') return '';
  const other = mine === match.home ? match.away : match.home;
  const [a, b] = [Number(mine.score), Number(other.score)];
  if (mine.winner || (Number.isFinite(a) && Number.isFinite(b) && a > b)) return 'W';
  if (other.winner || (Number.isFinite(a) && Number.isFinite(b) && a < b)) return 'L';
  return 'D';
}

/** One of my teams: its crest and colour, form, last result, a game on now, and what's next. */
export function teamCard(title, matches, now = Date.now()) {
  const sorted = matches.filter((match) => Number.isFinite(match.start)).sort((a, b) => a.start - b.start);
  const done = sorted.filter((match) => match.state === 'post');
  const live = sorted.find((match) => match.state === 'in') || null;
  const ahead = sorted.filter((match) => match.state === 'pre' && match.start > now - 4 * 3600000);
  const sides = sorted.flatMap((match) => [match.home, match.away]).filter(isMine);
  const team = sides.find((item) => item.logo) || sides[0] || { name: title, full: title, logo: '', color: '' };
  return {
    title,
    team: { name: title, logo: team.logo, color: TEAM_COLORS[title] || team.color, record: sorted.some((match) => match.sport !== 'soccer/all') ? [...sides].reverse().find((item) => item.record)?.record || '' : '' },
    form: done.slice(-5).map(outcome).filter(Boolean),
    last: done.at(-1) || null,
    live,
    next: ahead.slice(0, 3),
  };
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
    ].filter((section) => section.matches).map((section) => ({ card: teamCard(section.title, section.matches, now) }));
    if (!sections.length) throw new Error('No team answered');
    return sections;
  }
  const matches = tab.united ? await manUnitedMatches(now) : tab.team ? await teamMatches(tab.team) : await leagueMatches(tab.path, tab.name, now);
  return [{ title: '', matches: inWindow(matches, now) }];
}

export const isMine = (side) => MY_TEAMS.some((name) => side.full.includes(name));
