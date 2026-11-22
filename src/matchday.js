// Matchday: your team's game day, made an occasion (like Sky's Super Sunday). Everything here is
// worked out from data, without the page, so it can be tested: which part of the day it is, what
// ESPN's match file says, which of your channels is showing it, and the win-chance story.
//
// Where it comes from: ESPN's public match file (form, table, line-ups, timeline, stats,
// commentary, videos, news), Polymarket's win markets (odds.js), your TV guide (guide.json) and
// the club's own YouTube uploads (highlights.json, from the highlights job). All free, no key.

import { parseLineups, shortName, toMatch } from './matches.js';

/** Your Matchday team. Stored as a setting so it can later be any soccer team in your leagues. */
export const MATCHDAY_TEAMS = {
  360: { id: '360', title: 'Man United', short: 'Man Utd', full: 'Manchester United' },
};
const TEAM_KEY = 'multigrid.matchdayteam.v1';
export function matchdayTeam() {
  let id = '360';
  try { id = localStorage.getItem(TEAM_KEY) || id; } catch { /* the default */ }
  return MATCHDAY_TEAMS[id] ?? MATCHDAY_TEAMS[360];
}

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
/** The build-up takes over the banner this long before kick-off (or when the TV coverage starts, if earlier). */
export const BUILDUP_LEAD = 2 * HOUR;
/** After the whistle the full-time card holds the banner for the same two hours. */
export const POST_MATCH_HOLD = 2 * HOUR;
const FULLTIME_KEY = 'multigrid.matchday.fulltime.v1';

/** Remember when this match first reached full time, so the hold survives a reload. */
export function markFulltime(matchId, now = Date.now(), start = 0) {
  if (!matchId) return 0;
  try {
    const all = JSON.parse(localStorage.getItem(FULLTIME_KEY) || '{}');
    if (!all[matchId]) {
      // If the page wasn't open at the whistle, don't extend the hold from when it was opened.
      all[matchId] = Number(start) > 0 ? Math.min(now, Number(start) + 2 * HOUR) : now;
      const keep = Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, 4);
      localStorage.setItem(FULLTIME_KEY, JSON.stringify(Object.fromEntries(keep)));
    }
    return Number(all[matchId]) || now;
  } catch {
    return now;
  }
}

export function fulltimeAt(matchId) {
  try { return Number(JSON.parse(localStorage.getItem(FULLTIME_KEY) || '{}')[matchId]) || 0; } catch { return 0; }
}

/** 2 h after full time; if the app wasn't open at the whistle, kick-off + 2 h is the fallback. */
export function fulltimeHoldUntil(matchId, start = 0) {
  const at = fulltimeAt(matchId) || (Number(start) > 0 ? Number(start) + 2 * HOUR : 0);
  return at ? at + POST_MATCH_HOLD : 0;
}

export const isFulltimeHold = (matchId, start, now = Date.now()) => now < fulltimeHoldUntil(matchId, start);

export const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

/** A game that won't be played today after all. */
export const isCalledOff = (match) => /postpon|cancel|abandon|suspend|delay/i.test(match?.detail || '');

/** Today's game for the team (whatever its state) and its next game after today. */
export function pickMatches(matches, now = Date.now()) {
  const sorted = (Array.isArray(matches) ? matches : []).filter((match) => Number.isFinite(match?.start)).sort((a, b) => a.start - b.start);
  const today = sorted.find((match) => sameDay(match.start, now)) || null;
  const next = sorted.find((match) => match.start > now && !sameDay(match.start, now) && match.state === 'pre') || null;
  return { today, next };
}

/**
 * Which part of match day it is:
 *  'early'    match day, before the build-up: the game is just first in the banner's rotation
 *  'buildup'  from two hours before kick-off (or the TV coverage, if that starts sooner): it takes over
 *  'live'     the game is on
 *  'fulltime' finished (or called off): the full-time card rotates for the rest of the day
 *  'off'      not match day
 */
export function phaseOf(match, now = Date.now(), tvStart = NaN) {
  if (!match || !Number.isFinite(match.start) || !sameDay(match.start, now)) return 'off';
  if (match.state === 'in') return 'live';
  if (match.state === 'post' || isCalledOff(match)) return 'fulltime';
  // TV coverage only counts if it starts before kick-off, on the same day.
  const coverage = Number.isFinite(tvStart) && tvStart < match.start && match.start - tvStart <= 6 * HOUR ? tvStart : Infinity;
  return now >= Math.min(match.start - BUILDUP_LEAD, coverage) ? 'buildup' : 'early';
}

/** "1 h 24 min", "8 min", "Under a minute", "5 days". */
export function countdownText(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'Now';
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 1) return 'Under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
  const days = Math.round(ms / (24 * HOUR));
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** "1st", "2nd", "3rd", "11th". */
export function ordinal(number) {
  const n = Number(number);
  if (!Number.isFinite(n) || n < 1) return '';
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  return `${n}${suffix}`;
}

const STATS = [
  ['possessionPct', 'Possession', '%'],
  ['totalShots', 'Shots', ''],
  ['shotsOnTarget', 'On target', ''],
  ['wonCorners', 'Corners', ''],
  ['foulsCommitted', 'Fouls', ''],
  ['saves', 'Saves', ''],
];

const https = (url) => (typeof url === 'string' && /^https:\/\//.test(url) ? url : '');

/** One moment in the match: a goal, a card or a substitution, with its minute. */
function moment(item, homeId) {
  const type = String(item?.type?.text || '');
  const people = (item?.participants ?? []).map((person) => person?.athlete?.displayName).filter(Boolean);
  const side = !item?.team?.id ? '' : String(item.team.id) === homeId ? 'home' : 'away';
  const minute = String(item?.clock?.displayValue || '');
  if (item?.scoringPlay || /^(goal|penalty - scored|own goal)/i.test(type)) {
    return { kind: 'goal', minute, side, player: shortName(people[0] || ''), assist: shortName(people[1] || ''), note: /own goal/i.test(type) ? 'OG' : /penalty/i.test(type) ? 'pen' : '' };
  }
  if (/red card/i.test(type)) return { kind: 'red', minute, side, player: shortName(people[0] || ''), note: /yellow/i.test(type) ? '2nd yellow' : '' };
  if (/yellow card/i.test(type)) return { kind: 'yellow', minute, side, player: shortName(people[0] || '') };
  if (/substitution/i.test(type)) return { kind: 'sub', minute, side, player: shortName(people[0] || ''), off: shortName(people[1] || '') };
  if (/^halftime$/i.test(type)) return { kind: 'break', minute: 'HT', side: '', label: 'Half time' };
  if (/^(end regular time|full ?time|match ends?)$/i.test(type)) return { kind: 'break', minute: 'FT', side: '', label: 'Full time' };
  return null;
}

/**
 * Everything ESPN's match file says, ready to draw. Missing parts are empty, never undefined:
 * before kick-off there are no stats, timeline or commentary; line-ups come about an hour before.
 */
export function parseSummary(answer) {
  const competition = answer?.header?.competitions?.[0];
  if (!competition) return null;
  const match = toMatch({ id: answer.header.id, date: competition.date, competitions: [competition] }, answer.header?.league?.name || '', 'soccer/all');
  match.venue = answer.gameInfo?.venue?.fullName || match.venue || '';
  const homeId = match.home.id;

  const form = { home: [], away: [] };
  for (const team of answer.lastFiveGames ?? []) {
    const results = (team.events ?? []).slice().sort((a, b) => Date.parse(a.gameDate) - Date.parse(b.gameDate))
      .map((game) => String(game.gameResult || '').toUpperCase()).filter((result) => /^[WDL]$/.test(result));
    form[String(team.team?.id) === homeId ? 'home' : 'away'] = results.slice(-5);
  }

  const table = new Map();
  for (const entry of answer.standings?.groups?.[0]?.standings?.entries ?? []) {
    const stats = Object.fromEntries((entry.stats ?? []).map((stat) => [stat.name, stat.displayValue]));
    if (entry.id) table.set(String(entry.id), { rank: Number(stats.rank) || 0, points: Number(stats.points) || 0, played: Number(stats.gamesPlayed) || 0 });
  }
  const positions = { home: table.get(homeId) ?? null, away: table.get(match.away.id) ?? null };

  const timeline = (answer.keyEvents ?? []).map((item) => moment(item, homeId)).filter(Boolean);

  const teams = answer.boxscore?.teams ?? [];
  const statsOf = (id) => Object.fromEntries((teams.find((team) => String(team.team?.id) === id)?.statistics ?? []).map((stat) => [stat.name, stat.displayValue]));
  const homeStats = statsOf(homeId);
  const awayStats = statsOf(match.away.id);
  const stats = STATS.filter(([name]) => homeStats[name] != null && awayStats[name] != null).map(([name, label, unit]) => {
    const home = Number(homeStats[name]) || 0;
    const away = Number(awayStats[name]) || 0;
    return { name, label, home: unit === '%' ? Math.round(home) : home, away: unit === '%' ? Math.round(away) : away, unit };
  });

  const commentary = (answer.commentary ?? [])
    .filter((line) => String(line?.text || '').trim())
    .sort((a, b) => (Number(b.sequence) || 0) - (Number(a.sequence) || 0))
    .map((line) => ({ minute: String(line.time?.displayValue || ''), text: String(line.text).trim() }));

  const videos = (answer.videos ?? []).map((video) => ({
    title: String(video?.headline || '').trim(),
    url: https(video?.links?.source?.HD?.href) || https(video?.links?.source?.href),
    thumb: https(video?.thumbnail),
    seconds: Number(video?.duration) || 0,
    published: Date.parse(video?.originalPublishDate || video?.lastModified || '') || 0,
  })).filter((video) => video.title && video.url);

  const news = (answer.news?.articles ?? []).map((article) => ({
    title: String(article?.headline || '').trim(),
    about: String(article?.description || '').trim(),
    url: https(article?.links?.web?.href),
    image: https(article?.images?.[0]?.url),
  })).filter((article) => article.title && article.url);

  const league = { name: String(answer.header?.league?.name || ''), slug: String(answer.header?.league?.slug || '') };
  return { match, league, form, positions, timeline, stats, commentary, videos, news, lineups: parseLineups(answer) };
}

const words = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter((word) => word && !['fc', 'afc', 'the', 'and', 'v', 'vs'].includes(word));

/** Every way a TV listing might name a team: "Man United", "Man Utd", "Manchester United", "Liverpool". */
export function teamNames(team) {
  const names = new Set([team?.name, team?.full].filter(Boolean).map((name) => words(name).join(' ')));
  for (const name of [...names]) {
    if (/\bunited\b/.test(name)) names.add(name.replace(/\bunited\b/, 'utd'));
    if (/^manchester\b/.test(name)) names.add(name.replace(/^manchester\b/, 'man'));
    if (/^man\b/.test(name) && !/^manchester\b/.test(name)) names.add(name.replace(/^man\b/, 'manchester'));
  }
  return [...names].filter(Boolean);
}

/** Whether a listing's title names this game: both teams, as whole words. */
export function listingNames(title, match) {
  const text = ` ${words(title).join(' ')} `;
  const has = (team) => teamNames(team).some((name) => text.includes(` ${name} `));
  return has(match.home) && has(match.away);
}

/**
 * Which of your channels is showing the game, from your TV guide: the first favorite whose
 * listings name both teams around kick-off, preferring a listing marked live and the one that
 * starts soonest (the build-up). `showsFor(favorite)` gives that channel's listings.
 * { favorite, start, end, title } or null.
 */
export function findBroadcast(match, favorites, showsFor) {
  if (!match) return null;
  let best = null;
  for (const favorite of favorites ?? []) {
    for (const show of showsFor(favorite) ?? []) {
      if (show.end <= match.start || show.start > match.start + 15 * MINUTE || match.start - show.start > 6 * HOUR) continue;
      if (!listingNames(show.title, match)) continue;
      const score = (show.live || /\blive\b/i.test(show.title) ? 0 : 1) * 1e13 + show.start;
      if (!best || score < best.score) best = { favorite, start: show.start, end: show.end, title: show.title, score };
    }
  }
  if (!best) return null;
  const { score, ...found } = best;
  return found;
}

/* The win-chance story: a point every minute while the match is on, kept so the full-time card
   can tell it after a reload. Chances are 0–1 for the home side, the draw and the away side. */
const HISTORY_KEY = 'multigrid.matchday.chances.v1';

export function addChance(points, at, odds, gap = 50000) {
  const list = Array.isArray(points) ? points.slice() : [];
  if (!odds || ![odds.home, odds.away].every(Number.isFinite)) return list;
  const point = [at, odds.home, Number.isFinite(odds.draw) ? odds.draw : null, odds.away];
  const last = list.at(-1);
  if (last && at - last[0] < gap) list[list.length - 1] = point;
  else list.push(point);
  return list.slice(-400);
}

export function loadChances(matchId) {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}')[matchId]?.points ?? []; } catch { return []; }
}

export function saveChances(matchId, points, now = Date.now()) {
  try {
    const all = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
    all[matchId] = { points, at: now };
    // Only the last few matches are kept.
    const keep = Object.entries(all).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 4);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch { /* not remembered */ }
}

/**
 * The team's chance as a line across the box: an SVG path from the first point to the last.
 * x is time across the match (kick-off to the last point, at least 105 minutes); y is 0–100%.
 */
export function chancePath(points, side, { width = 300, height = 80, start = NaN } = {}) {
  const at = side === 'home' ? 1 : 3;
  const list = (points ?? []).filter((point) => Number.isFinite(point?.[at]));
  if (list.length < 2) return '';
  const from = Number.isFinite(start) ? Math.min(start, list[0][0]) : list[0][0];
  const to = Math.max(list.at(-1)[0], from + 105 * MINUTE);
  const x = (time) => ((time - from) / (to - from)) * width;
  const y = (chance) => height - Math.max(0, Math.min(1, chance)) * height;
  return list.map((point, index) => `${index ? 'L' : 'M'}${x(point[0]).toFixed(1)},${y(point[at]).toFixed(1)}`).join(' ');
}

/* The table before the match, so the full-time card can say how it moved. */
const TABLE_KEY = 'multigrid.matchday.table.v1';
export function rememberPosition(matchId, rank) {
  if (!Number.isFinite(rank) || rank < 1) return;
  try {
    const all = JSON.parse(localStorage.getItem(TABLE_KEY) || '{}');
    if (all[matchId]) return;
    all[matchId] = rank;
    const keep = Object.entries(all).slice(-4);
    localStorage.setItem(TABLE_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch { /* not remembered */ }
}
export function positionBefore(matchId) {
  try { return Number(JSON.parse(localStorage.getItem(TABLE_KEY) || '{}')[matchId]) || 0; } catch { return 0; }
}

/** "Up to 9th", "Down to 12th", "Stay 9th", or "9th" when the earlier place isn't known. */
export function tableMove(before, after) {
  if (!after) return '';
  if (!before || before === after) return before ? `Stay ${ordinal(after)}` : ordinal(after);
  return before > after ? `Up to ${ordinal(after)}` : `Down to ${ordinal(after)}`;
}

/** The club's own uploads worth watching on match day: not the academy's or the women's other games. */
export function clubVideos(list, now = Date.now(), days = 4) {
  return (Array.isArray(list) ? list : [])
    .filter((video) => /^[\w-]{11}$/.test(video?.id || '') && video.title && now - (video.published || 0) < days * 24 * HOUR)
    .filter((video) => !/\b(u-?1[89]s?|u-?2[13]s?|academy|under[- ]?(18|21|23)s?)\b/i.test(video.title))
    .sort((a, b) => b.published - a.published);
}

/** Who's winning, from the team's side: 'W', 'D', 'L', or '' before the end. */
export function resultFor(match, teamId) {
  if (!match || match.state !== 'post') return '';
  const mine = match.home.id === teamId ? match.home : match.away;
  const other = mine === match.home ? match.away : match.home;
  const [a, b] = [Number(mine.score), Number(other.score)];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
  return a > b ? 'W' : a < b ? 'L' : 'D';
}
