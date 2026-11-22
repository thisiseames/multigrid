// Builds highlights.json: for each finished game in your leagues (src/leagues.js), up to three
// official highlights videos that play in Canada and inside other sites. Runs inside the Reader's
// job (about every 25 minutes) and on request (.github/workflows/highlights.yml).
//
// Where they come from: each league's official source for Canada (below), and both clubs' own
// channels. Nothing is searched for: GitHub's computers are in the US, and YouTube's search there
// hides everything that doesn't play in the US (the leagues' own highlights, Fubo Canada's...).
// Instead each source's own list of recent uploads is read (its public feed, which isn't filtered
// by country), and an upload is matched to a game by its title and when it went up.
// A video whose owner turned off playing on other sites (oEmbed answers 401) is left out; if
// YouTube still refuses one when it's played, the page moves on to the game's next video.

import fs from 'node:fs';
import { MY_LEAGUES } from '../src/leagues.js';

const OUT = new URL('../highlights.json', import.meta.url);
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36';
const HOUR = 3600000;
const LOOK_FOR = 30 * HOUR; // keep looking this long after kick-off
const FORGET = 4 * 24 * HOUR;
const MAX_LOOKUPS = Number(process.env.HIGHLIGHT_LOOKUPS || 12); // club channels looked up per run
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

// Each league's official highlights for Canada, as YouTube channel ids. Checked Nov 22, 2026:
// each had that day's games. Clubs' own channels are added per game.
const TSN = 'UC--i2rV5NCxiEIPefr3l-zQ';
const SPORTSNET = 'UCVhibwHk4WKw4leUt6JfRLg';
export const SOURCES = {
  pl: { UCD2lJITnvzflNhOqQckMpQg: 'Fubo Canada' },
  laliga: { 'UCTv-XvfzLX3i4IGWAm4sbmA': 'LALIGA EA SPORTS' },
  bundesliga: { UC6UL29enLNe4mqwTfAyeNuw: 'Bundesliga' },
  ligue1: {},
  ucl: {},
  unl: {},
  nfl: { UCDVYQ4Zhbm3S2dlz7P1GBDg: 'NFL', [TSN]: 'TSN' },
  nba: { UCWJ2lWNubArHWmf3FIHbfcQ: 'NBA', [TSN]: 'TSN', [SPORTSNET]: 'Sportsnet' },
};

// Matchday teams' own channels, known for sure (the channel search missed Man United's). Their
// recent uploads (press conferences, interviews, training) are kept in highlights.json under
// `club`, for Matchday's build-up and reaction rows; Shorts and live streams are left out.
// `about` picks the broadcasters' videos that are about the team (titles naming it).
export const MATCHDAY_CLUBS = {
  'pl:360': { channel: 'UC6yW44UGJJBvYTlfC7CRg2Q', name: 'Man Utd', about: /\bman(chester)?\.?\s*(utd|united)\b|\bold trafford\b|\bpochettino\b/i },
};
// Broadcasters and the league whose videos about the team join Matchday (previews, studio
// analysis, interviews, reaction). Checked Nov 22, 2026: each had Man United videos that week.
export const MATCHDAY_SOURCES = {
  UCNAf1k0yIjyGu3k9BwAg3lg: 'Sky Sports Premier League',
  UCcw05gGzjLIs5dnxGkQHMvw: 'Sky Sports News',
  UCZ7wY7MRDSygp63HIEfdQZA: 'Sky Sports Football',
  UCqZQlzSHbVJrwrn5XvzrzcA: 'NBC Sports',
  'UCG5qGWdu8nIRZqJ_GgDwQ-w': 'Premier League',
  UC4i_9WvfPRTuRWEaWyfKuFw: 'TNT Sports',
  UCD2lJITnvzflNhOqQckMpQg: 'Fubo Canada',
};

const GENERIC = new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'cd', 'ud', 'sd', 'rc', 'the', 'de', 'la', 'el', 'club', 'official', 'tv', 'hd', 'sport', 'sports', 'and', 'vs']);
export const words = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter((word) => word.length > 1 && !GENERIC.has(word));
const HIGHLIGHT_WORDS = /highlight|resumen|r[eé]sum[eé]|zusammenfassung|recap|all goals|extended|melhores momentos|sintesi/i;
const NOT_THE_GAME = /preview|press conference|reaction|predict|watchalong|podcast|interview|training|mic'd up|\bfifa\b|efootball|madden|2k\d\d|simulation|#shorts/i;

const dayParam = (time) => new Date(time).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }).replaceAll('-', '');

const teamOf = (competitor) => {
  const team = competitor?.team ?? {};
  return { id: String(team.id ?? ''), name: team.shortDisplayName || team.displayName || '', full: team.displayName || '', nick: team.name || '', place: team.location || '', abbr: team.abbreviation || '', score: competitor?.score ?? '' };
};
/** Every way a title might name a team: "Manchester United", "Man United", "Red Devils"... */
const teamWords = (team) => new Set([...words(team.full), ...words(team.name), ...words(team.nick), ...words(team.place), ...words(team.abbr)].filter((word) => word.length > 2));

/** Whether a title names this team: one of its words, or a word starting with one ("Lyonnais" for Lyon). */
export function names(title, team) {
  const have = words(title);
  return [...teamWords(team)].some((word) => have.some((got) => got === word || (word.length >= 4 && got.startsWith(word))));
}

/** Finished games in one league from yesterday and today (Toronto time). */
async function finishedGames(league, now) {
  const days = [...new Set([dayParam(now - 24 * HOUR), dayParam(now)])];
  const games = [];
  for (const day of days) {
    const answer = await fetch(`${ESPN}/${league.path}/scoreboard?dates=${day}`, { signal: AbortSignal.timeout(15000) }).then((r) => (r.ok ? r.json() : { events: [] })).catch(() => ({ events: [] }));
    for (const event of answer.events ?? []) {
      const game = event.competitions?.[0] ?? {};
      if ((game.status?.type ?? event.status?.type ?? {}).state !== 'post') continue;
      const competitors = game.competitors ?? [];
      const home = teamOf(competitors.find((item) => item.homeAway === 'home') ?? competitors[0]);
      const away = teamOf(competitors.find((item) => item.homeAway === 'away') ?? competitors[1]);
      games.push({ id: String(event.id), league, start: Date.parse(event.date), home, away });
    }
  }
  return games;
}

/** A channel's recent uploads from its public feed: [{ id, title, published }]. */
export function parseFeed(xml) {
  const decode = (text) => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return [...String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, entry]) => ({
    id: entry.match(/<yt:videoId>([^<]+)/)?.[1] ?? '',
    title: decode(entry.match(/<title>([^<]*)/)?.[1] ?? ''),
    published: Date.parse(entry.match(/<published>([^<]+)/)?.[1] ?? ''),
  })).filter((item) => item.id && Number.isFinite(item.published));
}

const feeds = new Map();
function uploadsOf(channelId) {
  if (!feeds.has(channelId)) {
    // UULF…: the channel's uploads without Shorts or live streams.
    feeds.set(channelId, fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${channelId.slice(2)}`, { signal: AbortSignal.timeout(15000) })
      .then((response) => (response.ok ? response.text() : '')).then(parseFeed).catch(() => []));
  }
  return feeds.get(channelId);
}

/**
 * Whether a channel's name is the club's own: it holds the club's whole name ("Atlanta Hawks",
 * "OGC Nice", "Olympique Lyonnais" for Lyon) and is either just that or says it's a club. "Ah Nice"
 * (a singer) or a fan channel never is.
 */
export function isClubChannel(channel, team) {
  const squash = (text) => words(text).join('');
  const name = squash(channel);
  const full = squash(team.full || team.name);
  if (!full || /\bfans?\b|news|daily|zone|talk|podcast|nation|central|world|highlights?\b/i.test(channel)) return false;
  const holds = name.includes(full) || (full.length >= 4 && words(channel).some((word) => word.startsWith(full)));
  if (!holds) return false;
  const club = /\b(fc|cf|afc|ac|as|sc|ogc|losc|rc|ss|ssc|sv|tsg|vfb|vfl|bvb|rb|cd|ud|olympique|club|official|football|futbol|fútbol|calcio)\b/i;
  return name === full || club.test(channel) || squash(team.full).split('').length >= 8 && name.startsWith(full);
}

/** A club's own YouTube channel: the top verified channel named after it. '' if none; null if YouTube didn't answer. */
async function findClubChannel(team) {
  const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(team.full || team.name)}&sp=EgIQAg%253D%253D&hl=en`, {
    headers: { 'User-Agent': BROWSER, 'Accept-Language': 'en-US' }, redirect: 'manual', signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!response || response.status !== 200) return null;
  const html = await response.text();
  const found = [...html.matchAll(/"channelRenderer":\{"channelId":"(UC[\w-]{22})","title":\{"simpleText":"((?:[^"\\]|\\.)*)"/g)];
  for (const [index, match] of found.entries()) {
    const chunk = html.slice(match.index, found[index + 1]?.index ?? match.index + 8000);
    const verified = /BADGE_STYLE_TYPE_VERIFIED"/.test(chunk);
    if (verified && isClubChannel(match[2], team)) return match[1];
  }
  return '';
}

/**
 * This game's highlights among some uploads. From a league or broadcaster the title must name
 * both teams; from a club's own channel it only has to say it's highlights, since a club plays
 * once in a day. Either way it went up after kick-off, within LOOK_FOR.
 */
export function matchUploads(uploads, game, { kind, rank }) {
  return uploads.filter((upload) => upload.published > game.start && upload.published - game.start < LOOK_FOR
      && HIGHLIGHT_WORDS.test(upload.title) && !NOT_THE_GAME.test(upload.title)
      && (kind === 'club'
        // A club's channel also posts its other teams' games (reserves, women): the title must show
        // this game's score or name the other side.
        ? hasScore(upload.title, game) || names(upload.title, game.home) && names(upload.title, game.away) || names(upload.title, kind === 'club' && rank >= 2 ? game.away : game.home)
        : names(upload.title, game.home) && names(upload.title, game.away)))
    // One player's highlights come after the game's own.
    .map((upload) => ({ ...upload, rank: rank + gameBonus(upload.title) }));
}

/** The whole game's highlights first; one player's after ("James Harden Highlights", "drops 36 points"). */
export function gameBonus(title) {
  const named = title.match(/([A-Z][a-z]+) ([A-Z][a-zA-Z'-]+) Highlights/);
  const player = /\b\d+\s*(pts|points|reb|rebounds|ast|assists)\b|career[- ]high|player highlights/i.test(title)
    || (named && !/^(premier|full|match|game|league|extended|official|postgame|nba|nfl|week|season)$/i.test(named[1])
      && !/^(league|game|cup|highlights)$/i.test(named[2]));
  if (player) return -1;
  return /full game|game highlights|game recap|postgame|extended|resumen|r[eé]sum[eé]|zusammenfassung|match highlights|league highlights|\d\s*[-–:]\s*\d/i.test(title) ? 0.5 : 0;
}

/** "0-1", "0 - 1", "0:1", "(0-1)": this game's score, either way round. */
export function hasScore(title, game) {
  const [a, b] = [game.home.score, game.away.score].map((score) => String(score ?? '').trim());
  if (a === '' || b === '') return false;
  const score = (x, y) => new RegExp(`(^|[^\\d])${x}\\s*[-–:]\\s*${y}([^\\d]|$)`).test(title);
  return score(a, b) || score(b, a);
}

/** 200: other sites may play it. 401: its owner said no. */
const embeddable = (id) => fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(10000) })
  .then((response) => response.status === 200).catch(() => false);

async function main() {
  const now = Date.now();
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }
  // Games found the old way (by searching) are found again from the channels.
  const games = Object.fromEntries(Object.entries(saved.games ?? {}).filter(([, game]) => now - game.start < FORGET && game.sources === 'feeds'));
  const clubs = saved.clubs ?? {};
  for (const [key, club] of Object.entries(MATCHDAY_CLUBS)) if (!clubs[key]) clubs[key] = club.channel;

  const finished = (await Promise.all(MY_LEAGUES.map((league) => finishedGames(league, now)))).flat()
    .filter((game) => now - game.start < LOOK_FOR)
    .sort((a, b) => b.start - a.start);

  let lookups = 0;
  for (const game of finished) {
    for (const team of [game.home, game.away]) {
      const key = `${game.league.id}:${team.id}`;
      if (key in clubs || lookups >= MAX_LOOKUPS) continue;
      lookups++;
      await pause(3000);
      const channel = await findClubChannel(team);
      if (channel !== null) clubs[key] = channel;
    }
    const sources = [
      ...Object.keys(SOURCES[game.league.id] ?? {}).map((id) => ({ id, kind: 'league', rank: 3 })),
      clubs[`${game.league.id}:${game.home.id}`] ? { id: clubs[`${game.league.id}:${game.home.id}`], kind: 'club', rank: 2 } : null,
      clubs[`${game.league.id}:${game.away.id}`] ? { id: clubs[`${game.league.id}:${game.away.id}`], kind: 'club', rank: 1.5 } : null,
    ].filter(Boolean);
    const found = [];
    for (const source of sources) found.push(...matchUploads(await uploadsOf(source.id), game, source));
    found.sort((a, b) => b.rank - a.rank || a.published - b.published);

    // Best first, each run: what's found now plus what was found before (a busy channel's feed
    // only shows its newest uploads, so earlier finds may have scrolled off it).
    const before = games[game.id]?.videos ?? [];
    const pool = [...found, ...before.filter((video) => !found.some((pick) => pick.id === video.id)).map((video) => ({ ...video, rank: video.rank ?? 0, known: true }))]
      .sort((a, b) => b.rank - a.rank || (a.published ?? 0) - (b.published ?? 0));
    const videos = [];
    for (const pick of pool) {
      if (videos.length >= 3) break;
      if (videos.some((video) => video.id === pick.id)) continue;
      if (!pick.known) { await pause(200); if (!(await embeddable(pick.id))) continue; }
      videos.push({ id: pick.id, title: pick.title, rank: pick.rank });
    }
    games[game.id] = {
      league: game.league.name,
      title: `${game.home.name} ${game.home.score}–${game.away.score} ${game.away.name}`,
      start: game.start,
      sources: 'feeds',
      videos,
    };
    console.log(`${game.league.name}: ${games[game.id].title} → ${videos.length ? videos.map((video) => video.title.slice(0, 70)).join(' | ') : 'none yet'}`);
    if (process.env.HIGHLIGHT_DEBUG && !videos.length) {
      for (const source of sources) console.log(`    ${source.kind} ${source.id}: ${(await uploadsOf(source.id)).slice(0, 5).map((upload) => `${new Date(upload.published).toISOString().slice(5, 16)} ${upload.title.slice(0, 50)}`).join(' | ')}`);
      for (const team of [game.home, game.away]) if (!clubs[`${game.league.id}:${team.id}`]) console.log(`    no channel found for ${team.full}`);
    }
  }
  // Matchday: from the last four days, the club's own uploads and the broadcasters' videos about
  // the team, newest first, that play on other sites.
  const club = {};
  for (const [key, { channel, name, about }] of Object.entries(MATCHDAY_CLUBS)) {
    const team = key.split(':')[1];
    const known = new Map((saved.club?.[team] ?? []).map((video) => [video.id, video]));
    const pool = (await uploadsOf(channel)).slice(0, 12).map((upload) => ({ ...upload, source: name }));
    for (const [id, source] of Object.entries(MATCHDAY_SOURCES)) {
      pool.push(...(await uploadsOf(id)).filter((upload) => about.test(upload.title)).map((upload) => ({ ...upload, source })));
    }
    const list = [];
    for (const upload of pool.filter((item) => now - item.published < FORGET).sort((a, b) => b.published - a.published)) {
      if (list.length >= 24 || list.some((video) => video.id === upload.id)) continue;
      if (!known.has(upload.id)) { await pause(200); if (!(await embeddable(upload.id))) continue; }
      list.push({ id: upload.id, title: upload.title, published: upload.published, source: upload.source });
    }
    club[team] = list.length ? list : (saved.club?.[team] ?? []).filter((video) => now - video.published < FORGET);
    console.log(`Matchday ${team}: ${club[team].length} videos (${[...new Set(club[team].map((video) => video.source))].join(', ')})`);
  }
  fs.writeFileSync(OUT, `${JSON.stringify({ updated: now, games, clubs, club }, null, 1)}\n`);
  console.log(`highlights.json: ${Object.values(games).filter((game) => game.videos.length).length} games with highlights; ${Object.values(clubs).filter(Boolean).length} club channels known (${lookups} looked up this run).`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error); process.exitCode = 0; });
