// SofaScore's public match JSON, read in the browser. It is free and keyless, and unlike
// api.sofascore.com the www host answers cross-origin requests. ESPN is still the match spine;
// these are only the pieces ESPN does not carry (xG, big chances, period splits, player ratings,
// momentum, average positions).
//
// The endpoints are unofficial. Everything here is cached, failures return null, and the app
// keeps the ESPN view when they do not answer.

const BASE = 'https://www.sofascore.com/api/v1';
const asks = new Map();

export const normalizeName = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\b(fc|afc|cf|sc|the)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Football names vary: Man Utd / Manchester United, Brighton / Brighton and Hove Albion. */
const sameName = (a, b) => {
  const alias = (name) => String(name || '')
    .replace(/\bman\b/g, 'manchester')
    .replace(/\butd\b/g, 'united')
    .replace(/\s+/g, ' ')
    .trim();
  const left = alias(a);
  const right = alias(b);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
};

const json = (path, ttl = 30000) => {
  const at = Date.now();
  const known = asks.get(path);
  // A failure waits at most a minute, even when the successful answer is cached longer.
  if (known && at - known.at < (known.failed ? Math.min(ttl, 60000) : ttl)) return known.ask;
  const ask = fetch(`${BASE}${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout?.(8000),
  })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  asks.set(path, { at, ask });
  ask.then((value) => {
    if (!value && asks.get(path)?.ask === ask) asks.set(path, { at: Date.now(), ask: Promise.resolve(null), failed: true });
  });
  return ask;
};

/** SofaScore search wraps match results as { type: 'event', entity: { id, homeTeam, ... } }. */
export function sofascoreEvents(found) {
  return (found?.results ?? [])
    .filter((item) => item?.type === 'event' && item.entity?.id)
    .map((item) => item.entity);
}

/** The same fixture in SofaScore: search by both teams, then confirm the kick-off time. */
export async function findSofascoreEvent(match, ttl = 10 * 60000) {
  if (!match?.home?.name || !match?.away?.name || !Number.isFinite(match.start)) return null;
  const key = `match:${match.id || `${match.home.name}|${match.away.name}|${match.start}`}`;
  const known = asks.get(key);
  if (known && Date.now() - known.at < ttl) return known.ask;

  const ask = (async () => {
    const home = normalizeName(match.home.name);
    const away = normalizeName(match.away.name);
    const found = await json(`/search/all?q=${encodeURIComponent(`${match.home.name} ${match.away.name}`)}`, 600000);
    const candidates = sofascoreEvents(found)
      .filter((entity) => {
        const itemHome = normalizeName(entity.homeTeam?.name || entity.name?.split(' - ')[0]);
        const itemAway = normalizeName(entity.awayTeam?.name || entity.name?.split(' - ')[1]);
        return sameName(itemHome, home) && sameName(itemAway, away);
      })
      .filter((entity) => !Number.isFinite(entity.startTimestamp)
        || Math.abs(entity.startTimestamp * 1000 - match.start) <= 18 * 3600000)
      .slice(0, 5);
    for (const candidate of candidates) {
      const answer = await json(`/event/${candidate.id}`, 600000);
      const event = answer?.event;
      if (!event || !Number.isFinite(event.startTimestamp)) continue;
      if (Math.abs(event.startTimestamp * 1000 - match.start) > 18 * 3600000) continue;
      return { id: event.id, event };
    }
    // A live game may not be in search yet; the live list is one request and already cached.
    const live = await json('/sport/football/events/live', 30000);
    const event = (live?.events ?? []).find((item) => {
      const itemHome = normalizeName(item.homeTeam?.name);
      const itemAway = normalizeName(item.awayTeam?.name);
      return sameName(itemHome, home) && sameName(itemAway, away)
        && Math.abs((item.startTimestamp || 0) * 1000 - match.start) < 18 * 3600000;
    });
    return event ? { id: event.id, event } : null;
  })();

  asks.set(key, { at: Date.now(), ask });
  return ask;
}

const numberValue = (value) => {
  if (value == null || String(value).trim() === '') return null;
  const number = Number(String(value).replace('%', '').trim());
  return Number.isFinite(number) ? number : null;
};

const GAP_STATS = [
  ['Expected goals', 'xG', 2],
  ['Expected goals on target', 'xG on target', 2],
  ['Big chances', 'Big chances', 0],
  ['Big chances missed', 'Big chances missed', 0],
  ['Shots inside box', 'Shots in box', 0],
  ['Shots outside box', 'Shots outside box', 0],
];

/** The xG / big-chance rows by period, from SofaScore's statistics endpoint. */
export function parseSofascoreStats(answer) {
  const periods = new Map();
  for (const period of answer?.statistics ?? []) {
    const items = new Map();
    for (const group of period.groups ?? []) {
      for (const item of group.statisticsItems ?? []) {
        if (item?.name) items.set(item.name, item);
      }
    }
    periods.set(period.period, items);
  }
  const rows = (period) => GAP_STATS.flatMap(([name, label, decimals]) => {
    const item = periods.get(period)?.get(name);
    const home = numberValue(item?.home);
    const away = numberValue(item?.away);
    if (home == null || away == null) return [];
    return [{ key: name, label, home, away, decimals }];
  });
  return {
    source: 'SofaScore',
    all: rows('ALL'),
    first: rows('1ST'),
    second: rows('2ND'),
  };
}

/** SofaScore player ratings, keyed by the player's normalized name, per side. */
export function parseSofascoreRatings(lineups) {
  const side = (team) => {
    const ratings = new Map();
    for (const entry of team?.players ?? []) {
      const name = entry?.player?.name;
      const rating = Number(entry?.statistics?.rating);
      if (!name || !Number.isFinite(rating) || rating <= 0) continue;
      ratings.set(normalizeName(name), rating);
    }
    return ratings;
  };
  return { home: side(lineups?.home), away: side(lineups?.away) };
}

/**
 * SofaScore's average positions, keyed by normalized name. X runs from the team's own goal
 * (about 0) to the opponent's (about 100); Y runs across the pitch.
 */
export function parseSofascorePositions(answer) {
  const side = (team) => {
    const positions = new Map();
    for (const entry of Object.values(team ?? {})) {
      const name = entry?.player?.name;
      const x = Number(entry?.averageX);
      const y = Number(entry?.averageY);
      if (!name || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      positions.set(normalizeName(name), { x, y });
    }
    return positions;
  };
  return { home: side(answer?.home), away: side(answer?.away) };
}

/** [[minute, value], …] with positive values for the home side. */
export function parseSofascoreMomentum(answer) {
  return (answer?.graphPoints ?? [])
    .filter((point) => Number.isFinite(point?.minute) && Number.isFinite(point?.value))
    .map((point) => [Number(point.minute), Number(point.value)]);
}

/** The gaps for one match. Any missing endpoint leaves its piece null. */
export async function loadSofascoreGaps(match) {
  const found = await findSofascoreEvent(match);
  if (!found) return null;
  const [stats, lineups, momentum, positions] = await Promise.all([
    json(`/event/${found.id}/statistics`, 45000),
    json(`/event/${found.id}/lineups`, 5 * 60000),
    json(`/event/${found.id}/graph/momentum`, 45000),
    json(`/event/${found.id}/average-positions`, 5 * 60000),
  ]);
  return {
    eventId: found.id,
    event: found.event,
    stats: parseSofascoreStats(stats),
    ratings: parseSofascoreRatings(lineups),
    positions: parseSofascorePositions(positions),
    momentum: parseSofascoreMomentum(momentum),
  };
}
