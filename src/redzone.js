// RedZone mode: with several games on the grid, the one with the biggest moment right now gets
// the big slot and the sound. Worked out here without the page so it can be tested; the page
// fetches ESPN's scoreboards, says which tiles show which games, and moves the tiles.
//
// Big moments, strongest first:
//   NFL: a team inside the 20 (red zone); the last 2:00 of a one-score game (8 points or fewer)
//   Football: a red card (for 2 minutes after it); the last 10 minutes of a level or one-goal game
//   NBA: the last 3:00 of a game within 5 points
//   Any sport: win chance swinging 15 points or more within a minute
// A game keeps the big slot for at least a minute unless a stronger moment comes up, and when
// nothing is happening the big game stays where it is.

export const HOLD_MS = 60_000;
export const PAUSE_MS = 5 * 60_000;
const SWING = 0.15;
const SWING_WINDOW_MS = 60_000;

const STRENGTH = { redzone: 100, nflClose: 90, redCard: 85, swing: 75, nbaClose: 80, soccerClose: 70 };

const sportOf = (path = '') => (path.startsWith('soccer') ? 'soccer' : path.includes('nfl') ? 'nfl' : path.includes('nba') ? 'nba' : 'other');

/** ESPN's "4:12" or "0.4" as seconds. */
const clockSeconds = (text) => {
  const parts = String(text || '').split(':').map(Number);
  if (parts.some((part) => Number.isNaN(part))) return Infinity;
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
};

/** One ESPN scoreboard event, as what RedZone needs to know. */
export function liveGame(event, path) {
  const comp = event?.competitions?.[0] ?? {};
  const status = event?.status ?? {};
  const side = (where) => comp.competitors?.find((team) => team.homeAway === where) ?? {};
  const home = side('home');
  const away = side('away');
  const situation = comp.situation ?? {};
  const probability = situation.lastPlay?.probability;
  const homeWin = Number.isFinite(probability?.homeWinPercentage) ? probability.homeWinPercentage : null;
  const reds = (comp.details ?? []).filter((detail) => /red card/i.test(detail?.type?.text || '') || detail?.redCard)
    .map((detail) => Number(detail?.clock?.value)).filter(Number.isFinite);
  return {
    id: String(event?.id ?? ''),
    sport: sportOf(path),
    state: status.type?.state || 'pre',
    period: Number(status.period) || 0,
    clock: clockSeconds(status.displayClock),
    elapsed: Number(status.clock) || 0, // football: seconds played
    home: { abbr: home.team?.abbreviation || '', score: Number(home.score) || 0 },
    away: { abbr: away.team?.abbreviation || '', score: Number(away.score) || 0 },
    redZone: Boolean(situation.isRedZone),
    downDistance: situation.shortDownDistanceText || '',
    homeWin,
    redCards: reds,
  };
}

/**
 * The biggest moment in a game right now, or null. `history` is this game's recent win chances
 * ([{ at, homeWin }]) for spotting a swing.
 */
export function momentOf(game, history = [], now = Date.now()) {
  if (!game || game.state !== 'in') return null;
  const diff = Math.abs(game.home.score - game.away.score);
  const found = [];
  if (game.sport === 'nfl') {
    if (game.redZone) found.push({ kind: 'redzone', tag: `Red zone${game.downDistance ? ` · ${game.downDistance}` : ''}` });
    if (game.period >= 4 && game.clock <= 120 && diff <= 8) found.push({ kind: 'nflClose', tag: 'Final 2:00 · one score' });
  } else if (game.sport === 'nba') {
    if (game.period >= 4 && game.clock <= 180 && diff <= 5) found.push({ kind: 'nbaClose', tag: `Final 3:00 · ${diff ? `${diff}-point game` : 'tied'}` });
  } else if (game.sport === 'soccer') {
    if (game.redCards.some((at) => game.elapsed - at >= 0 && game.elapsed - at <= 120)) found.push({ kind: 'redCard', tag: 'Red card' });
    if (game.elapsed >= 80 * 60 && diff <= 1) found.push({ kind: 'soccerClose', tag: diff ? 'Final 10 min · one goal' : 'Final 10 min · level' });
  }
  if (game.homeWin !== null) {
    const before = history.filter((point) => now - point.at <= SWING_WINDOW_MS && point.homeWin !== null);
    if (before.some((point) => Math.abs(point.homeWin - game.homeWin) >= SWING)) found.push({ kind: 'swing', tag: 'Big swing' });
  }
  if (!found.length) return null;
  found.sort((a, b) => STRENGTH[b.kind] - STRENGTH[a.kind]);
  return { ...found[0], strength: STRENGTH[found[0].kind] };
}

/**
 * Which tile should be big. `candidates` are [{ id, moment }] for the tiles showing live games;
 * `current` is { id, since } for the tile that's big now (or null). Returns the id to make big,
 * or null to leave things as they are.
 *   · a stronger moment always takes over
 *   · an equal or weaker one never pushes out a game that still has its moment
 *   · a game whose moment has ended keeps the slot until it has had it a full minute
 *   · nothing happening anywhere: the big game stays
 */
export function pickBig(candidates, current, now = Date.now()) {
  const best = candidates.filter((item) => item.moment).sort((a, b) => b.moment.strength - a.moment.strength)[0];
  if (!best) return null;
  const mine = candidates.find((item) => item.id === current?.id);
  if (!mine) return best.id;
  if (best.id === mine.id) return null;
  if (!mine.moment) return now - (current.since || 0) >= HOLD_MS ? best.id : null;
  return best.moment.strength > mine.moment.strength ? best.id : null;
}

/** Keeps the last couple of minutes of win chances per game. */
export function noteChance(history, game, now = Date.now()) {
  if (game.homeWin === null) return history;
  return [...history.filter((point) => now - point.at <= 2 * SWING_WINDOW_MS), { at: now, homeWin: game.homeWin }];
}
