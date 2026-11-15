// Live standings from ESPN's public feed, which any page is allowed to read. It needs no
// key, and it's unofficial, so a failure says so instead of showing stale numbers.

const FEED = 'https://site.api.espn.com/apis/v2/sports';

export const LEAGUES = [
  { id: 'pl', name: 'Premier League', path: 'soccer/eng.1', kind: 'soccer' },
  { id: 'laliga', name: 'LaLiga', path: 'soccer/esp.1', kind: 'soccer' },
  {
    id: 'ucl', name: 'Champions League', path: 'soccer/uefa.champions', kind: 'soccer',
    zones: [{ from: 1, to: 8, cls: 'zone-in', label: 'Last 16' }, { from: 9, to: 24, cls: 'zone-playoff', label: 'Playoff round' }],
  },
  { id: 'unl', name: 'Nations League', path: 'soccer/uefa.nations', kind: 'soccer', groups: true },
  { id: 'nfc', name: 'NFC', path: 'football/nfl', kind: 'nfl', pick: 'National Football Conference', highlight: '49ers', division: true },
  { id: 'east', name: 'Eastern Conference', path: 'basketball/nba', kind: 'nba', pick: 'Eastern Conference', highlight: 'Raptors' },
];

const getJSON = (url) => fetch(url, { cache: 'no-store', signal: AbortSignal.timeout?.(10000) })
  .then((response) => {
    if (!response.ok) throw new Error(`ESPN answered ${response.status}`);
    return response.json();
  });

/** Every table in the answer, however deep ESPN nests it. */
function tables(node) {
  const out = [];
  if (node?.standings?.entries?.length) out.push({ name: node.name || '', entries: node.standings.entries });
  for (const child of node?.children ?? []) out.push(...tables(child));
  return out;
}

const stat = (entry, name) => entry.stats?.find((item) => item.name === name);
const num = (entry, name) => {
  const value = Number(stat(entry, name)?.value);
  return Number.isFinite(value) ? value : null;
};
const shown = (entry, name) => stat(entry, name)?.displayValue ?? '';

function row(entry) {
  const team = entry.team ?? {};
  return {
    id: String(team.id ?? ''),
    name: team.shortDisplayName || team.displayName || team.name || '?',
    full: team.displayName || team.name || '',
    rank: num(entry, 'rank'),
    seed: num(entry, 'playoffSeed'),
    played: shown(entry, 'gamesPlayed'),
    gd: shown(entry, 'pointDifferential'),
    points: shown(entry, 'points'),
    wins: shown(entry, 'wins'),
    losses: shown(entry, 'losses'),
    ties: num(entry, 'ties'),
    behind: shown(entry, 'gamesBehind'),
  };
}

const byRank = (key) => (a, b) => (a[key] ?? 999) - (b[key] ?? 999) || a.name.localeCompare(b.name);

/** One league, ready to draw: [{ name, rows }], sorted the way the league ranks itself. */
export async function loadLeague(league) {
  const data = await getJSON(`${FEED}/${league.path}/standings`);
  let groups = tables(data);
  if (league.pick) groups = groups.filter((group) => group.name.includes(league.pick));
  const key = league.kind === 'soccer' ? 'rank' : 'seed';
  const result = groups.map((group) => ({ name: group.name, rows: group.entries.map(row).sort(byRank(key)) }));
  if (!result.length || !result.some((group) => group.rows.length)) throw new Error('No table in the answer');
  if (league.division) {
    // Marks the teams that share the 49ers' division, from ESPN's division-level tables.
    try {
      const divisions = tables(await getJSON(`${FEED}/${league.path}/standings?level=3`));
      const mine = divisions.find((group) => group.entries.some((entry) => (entry.team?.displayName ?? '').includes(league.highlight)));
      if (mine) {
        const ids = new Set(mine.entries.map((entry) => String(entry.team?.id ?? '')));
        for (const group of result) for (const item of group.rows) item.division = ids.has(item.id);
        result.divisionName = mine.name;
      }
    } catch {
      // The table still shows; only the division marks are missing.
    }
  }
  return result;
}
