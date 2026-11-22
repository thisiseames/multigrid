// Builds highlights.json: for each finished game in your leagues (src/leagues.js), up to three
// official highlights videos on YouTube that other sites may play. Runs inside the Reader's job,
// about every 30 minutes.
//
// Only the league's own channel, a broadcaster that holds the rights, or either club's own channel
// counts; re-uploads by anyone else never do. A video whose owner turned off playing on other
// sites (YouTube's oEmbed answers 401) can't play in a tile, so it's left out. Whether a video
// plays in Canada can't be known from here (GitHub's computers are in the US), so the page tries
// the next video when YouTube refuses one.
//
// YouTube stops answering a computer that searches too fast, so searches are spaced out, each run
// does only a few, and a run stops at the first sign of YouTube's bot check.

import fs from 'node:fs';
import { MY_LEAGUES } from '../src/leagues.js';

const OUT = new URL('../highlights.json', import.meta.url);
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36';
const HOUR = 3600000;
const LOOK_FOR = 30 * HOUR; // keep looking this long after kick-off
const FORGET = 4 * 24 * HOUR;
const MAX_SEARCHES = Number(process.env.HIGHLIGHT_SEARCHES || 14);
const GAP = Number(process.env.HIGHLIGHT_GAP_MS || 12000);
const BUDGET = Date.now() + 6 * 60000;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

// Channels that hold the rights in each league, besides the clubs' own.
const OFFICIAL = {
  pl: ['Premier League', 'NBC Sports', 'Sky Sports Premier League', 'Sky Sports Football', 'DAZN Canada'],
  laliga: ['LALIGA EA SPORTS', 'LaLiga', 'ESPN FC', 'DAZN Canada'],
  bundesliga: ['Bundesliga', 'ESPN FC', 'DAZN Canada'],
  ligue1: ["Ligue 1 McDonald's", 'Ligue 1', 'beIN SPORTS USA', 'DAZN Canada'],
  ucl: ['UEFA', 'CBS Sports Golazo', 'TNT Sports Football', 'DAZN Canada', 'DAZN Football'],
  unl: ['UEFA', 'Fox Soccer', 'DAZN Canada'],
  nfl: ['NFL', 'TSN'],
  nba: ['NBA', 'TSN', 'Sportsnet'],
};

const GENERIC = new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'cd', 'ud', 'sd', 'rc', 'the', 'de', 'la', 'el', 'club', 'official', 'tv', 'hd', 'sport', 'sports', 'and']);
export const words = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter((word) => word.length > 1 && !GENERIC.has(word));
const squash = (text) => words(text).join('');
const HIGHLIGHT_WORDS = /highlight|resumen|r[eé]sum[eé]|zusammenfassung|recap|all goals|extended|melhores momentos|sintesi/i;
const NOT_THE_GAME = /preview|press conference|reaction|predict|live stream|watchalong|podcast|interview|training|\bfifa\b|\bpes\b|efootball|madden|nba 2k|simulation/i;

const dayParam = (time) => new Date(time).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }).replaceAll('-', '');

const teamOf = (competitor) => {
  const team = competitor?.team ?? {};
  return { name: team.shortDisplayName || team.displayName || '', full: team.displayName || '', nick: team.name || '', abbr: team.abbreviation || '', score: competitor?.score ?? '' };
};
const teamWords = (team) => new Set([...words(team.full), ...words(team.name), ...words(team.nick), ...words(team.abbr)]);

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

/** The videos on YouTube's results page: id, title, channel and how long ago. */
export function parseResults(html) {
  const found = [];
  const seen = new Set();
  for (const match of String(html).matchAll(/"videoRenderer":\{"videoId":"([\w-]{11})"/g)) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const chunk = html.slice(match.index, match.index + 8000);
    const title = chunk.match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/)?.[1] ?? '';
    const channel = chunk.match(/"ownerText":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/)?.[1] ?? '';
    const ago = chunk.match(/"publishedTimeText":\{"simpleText":"([^"]*)"/)?.[1] ?? '';
    const unescape = (text) => { try { return JSON.parse(`"${text}"`); } catch { return text; } };
    found.push({ id, title: unescape(title), channel: unescape(channel), ago });
  }
  return found;
}

// "2h ago", "45 minutes ago", "1 day ago": within about a day.
const isRecent = (ago) => !ago || /^\s*(?:streamed\s+)?(?:\d+\s*(?:s|sec|seconds?|m|min|minutes?|h|hr|hours?)|1\s*(?:d|day))\s+ago/i.test(ago);

/**
 * Which of the results are this game's official highlights, best first. A result counts when its
 * channel is the league's, a rights holder's or either club's, its title says it's highlights and
 * names the other side (or both sides, from a league or broadcaster), and it's from the last day.
 */
export function pickHighlights(results, game, official = []) {
  const home = teamWords(game.home);
  const away = teamWords(game.away);
  const names = (team) => [team.full, team.name].map(squash).filter(Boolean);
  const officialNames = official.map(squash);
  const picks = [];
  for (const result of results) {
    if (!HIGHLIGHT_WORDS.test(result.title) || NOT_THE_GAME.test(result.title) || !isRecent(result.ago)) continue;
    const channel = squash(result.channel);
    const title = new Set(words(result.title));
    const mentions = (set) => [...set].some((word) => title.has(word));
    const club = (team) => names(team).some((name) => name && (channel === name || channel.startsWith(name) || (name.length > 5 && name.startsWith(channel) && channel.length > 4)));
    let score = 0;
    if (officialNames.includes(channel)) score = mentions(home) && mentions(away) ? 3 : 0;
    else if (club(game.home)) score = mentions(away) ? 2 : 0;
    else if (club(game.away)) score = mentions(home) ? 1.5 : 0;
    if (!score) continue;
    if (/extended/i.test(result.title)) score += 0.5;
    picks.push({ ...result, score });
  }
  return picks.sort((a, b) => b.score - a.score);
}

async function search(query) {
  // sp=EgIIAw%3D%3D: uploaded this week.
  const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIIAw%253D%253D&hl=en&gl=CA`, {
    headers: { 'User-Agent': BROWSER, 'Accept-Language': 'en-US' }, redirect: 'manual', signal: AbortSignal.timeout(15000),
  });
  if (response.status !== 200) return null; // a redirect here is YouTube's bot check
  const html = await response.text();
  return html.includes('ytInitialData') ? parseResults(html) : null;
}

/** 200: other sites may play it. 401: its owner said no. */
const embeddable = (id) => fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(10000) })
  .then((response) => response.status === 200).catch(() => false);

async function main() {
  const now = Date.now();
  let saved = { games: {} };
  try { saved = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }
  const games = Object.fromEntries(Object.entries(saved.games ?? {}).filter(([, game]) => now - game.start < FORGET));

  const finished = (await Promise.all(MY_LEAGUES.map((league) => finishedGames(league, now)))).flat()
    .filter((game) => now - game.start < LOOK_FOR && !(games[game.id]?.videos?.length))
    // Newest first: those are the ones you're most likely to want.
    .sort((a, b) => b.start - a.start);

  let searches = 0;
  let blocked = false;
  for (const game of finished) {
    if (searches >= MAX_SEARCHES || Date.now() > BUDGET) break;
    if (searches) await pause(GAP);
    searches++;
    const results = await search(`${game.home.full} vs ${game.away.full} highlights`);
    if (!results) { blocked = true; break; }
    const videos = [];
    for (const pick of pickHighlights(results, game, OFFICIAL[game.league.id] ?? [])) {
      if (videos.length >= 3) break;
      if (await embeddable(pick.id)) videos.push({ id: pick.id, channel: pick.channel, title: pick.title });
      await pause(300);
    }
    games[game.id] = {
      league: game.league.name,
      title: `${game.home.name} ${game.home.score}–${game.away.score} ${game.away.name}`,
      start: game.start,
      videos,
    };
    console.log(`${game.league.name}: ${games[game.id].title} → ${videos.length ? videos.map((video) => video.channel).join(', ') : 'none yet'}`);
  }
  fs.writeFileSync(OUT, `${JSON.stringify({ updated: now, games }, null, 1)}\n`);
  console.log(`highlights.json: ${Object.values(games).filter((game) => game.videos.length).length} games with highlights; ${searches} searches${blocked ? '; stopped: YouTube asked for its bot check' : ''}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error); process.exitCode = 0; });
