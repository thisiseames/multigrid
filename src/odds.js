// Win odds for Game mode's Odds tab, from Polymarket's public market data (no key, no account).
// One small request per league with games today: just the win markets, for the hours those games
// start. Each game is matched to ESPN's by the two team names.

const API = 'https://gamma-api.polymarket.com/markets';

/** Polymarket's tag for each of Game mode's leagues. */
export const ODDS_TAGS = {
  'Premier League': 306,
  'Champions League': 100977,
  NFL: 450,
  NBA: 745,
};

const NOISE = new Set(['fc', 'afc', 'cf', 'sc', 'ac', 'fk', 'sk', 'the', 'and', 'de', 'vs']);
const words = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .split(/[^a-z0-9]+/).filter((word) => word && !NOISE.has(word));
const parseList = (value) => { try { return Array.isArray(value) ? value : JSON.parse(value || '[]'); } catch { return []; } };
const timeOf = (market) => Date.parse(market.endDate || String(market.gameStartTime || '').replace(' ', 'T').replace(/\+00$/, 'Z'));

export function oddsUrl(tag, from, to) {
  const params = new URLSearchParams({
    tag_id: String(tag), sports_market_types: 'moneyline', closed: 'false', limit: '100',
    end_date_min: new Date(from).toISOString(), end_date_max: new Date(to).toISOString(),
  });
  return `${API}?${params}`;
}

/**
 * Polymarket's win markets, grouped into games: { start, sides: [{ name, chance }], draw }.
 * A two-team market ("Knicks vs. Celtics") is one game; soccer has three yes/no markets per
 * game (each team, and the draw), which share the game's event.
 */
export function parseOdds(markets) {
  const games = new Map();
  for (const market of Array.isArray(markets) ? markets : []) {
    if (market.closed || market.sportsMarketType !== 'moneyline') continue;
    const start = timeOf(market);
    if (!Number.isFinite(start)) continue;
    const outcomes = parseList(market.outcomes);
    const prices = parseList(market.outcomePrices).map(Number);
    if (outcomes.length !== 2 || prices.length !== 2 || prices.some((price) => !Number.isFinite(price))) continue;
    if (outcomes[0] !== 'Yes') {
      // "Trail Blazers vs. Knicks": one market, both teams.
      games.set(market.slug, { start, sides: outcomes.map((name, index) => ({ name, chance: prices[index] })), draw: null });
      continue;
    }
    const key = market.events?.[0]?.slug || String(market.slug || '').replace(/-[a-z0-9]+$/, '');
    const game = games.get(key) ?? { start, sides: [], draw: null };
    games.set(key, game);
    const title = String(market.groupItemTitle || '');
    if (/^draw\b/i.test(title) || /-draw$/.test(market.slug || '')) game.draw = prices[0];
    else if (title) game.sides.push({ name: title, chance: prices[0] });
  }
  return [...games.values()].filter((game) => game.sides.length === 2);
}

const fit = (side, name) => {
  const mine = new Set(words(`${side.full} ${side.name}`));
  return words(name).filter((word) => mine.has(word)).length;
};

/**
 * This ESPN game's odds, or null: { home, away, draw } as chances from 0 to 1. Both team names
 * must match; the start time only breaks ties, since the two sites don't always agree on it.
 */
export function oddsFor(game, oddsGames) {
  let best = null;
  for (const candidate of oddsGames) {
    const gap = Math.abs(candidate.start - game.start);
    if (gap > 12 * 3600000) continue;
    const [a, b] = candidate.sides;
    const straight = Math.min(fit(game.home, a.name), fit(game.away, b.name));
    const swapped = Math.min(fit(game.home, b.name), fit(game.away, a.name));
    const score = Math.max(straight, swapped);
    if (score < 1 || (best && (best.score > score || (best.score === score && best.gap <= gap)))) continue;
    const [home, away] = straight >= swapped ? [a, b] : [b, a];
    best = { score, gap, odds: { home: home.chance, away: away.chance, draw: candidate.draw } };
  }
  return best?.odds ?? null;
}

/** "71%". Kept between 1% and 99%, so a game is never shown as certain and every chance is the same width. */
export function chanceText(chance) {
  if (!Number.isFinite(chance)) return '–';
  return `${Math.min(99, Math.max(1, Math.round(chance * 100)))}%`;
}

/** Odds for every game in Game mode's groups, as a Map from ESPN game id to { home, away, draw }. */
export async function loadOdds(groups) {
  const byLeague = new Map();
  for (const game of groups.flatMap((group) => group.games)) {
    if (!ODDS_TAGS[game.league] || !Number.isFinite(game.start)) continue;
    const list = byLeague.get(game.league) ?? [];
    if (!list.some((other) => other.id === game.id)) list.push(game);
    byLeague.set(game.league, list);
  }
  const found = new Map();
  await Promise.all([...byLeague].map(async ([league, games]) => {
    const starts = games.map((game) => game.start);
    const url = oddsUrl(ODDS_TAGS[league], Math.min(...starts) - 6 * 3600000, Math.max(...starts) + 6 * 3600000);
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout?.(10000) });
    if (!response.ok) throw new Error(`Polymarket answered ${response.status}`);
    const oddsGames = parseOdds(await response.json());
    for (const game of games) {
      const odds = oddsFor(game, oddsGames);
      if (odds) found.set(game.id, odds);
    }
  }).map((job) => job.catch(() => {})));
  return found;
}
