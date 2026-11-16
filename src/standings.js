// Live standings from ESPN's public feed, which any page is allowed to read. It needs no
// key, and it's unofficial, so a failure says so instead of showing stale numbers.

const FEED = 'https://site.api.espn.com/apis/v2/sports';

export const LEAGUES = [
  { id: 'pl', name: 'Premier League', path: 'soccer/eng.1', kind: 'soccer', highlight: 'Manchester United', highlightLabel: 'Man United', color: '#da291c' },
  { id: 'laliga', name: 'LaLiga', path: 'soccer/esp.1', kind: 'soccer' },
  {
    id: 'ucl', name: 'Champions League', path: 'soccer/uefa.champions', kind: 'soccer', highlight: 'Manchester United', highlightLabel: 'Man United', color: '#da291c',
  },
  { id: 'unl', name: 'Nations League', path: 'soccer/uefa.nations', kind: 'soccer', groups: true },
  {
    id: 'nfc', name: 'NFC', path: 'football/nfl', kind: 'nfl', pick: 'National Football Conference', highlight: '49ers', highlightLabel: '49ers', division: true, color: '#aa0000',
    lines: [{ after: 7, label: 'Playoff line' }],
  },
  {
    id: 'east', name: 'Eastern Conference', path: 'basketball/nba', kind: 'nba', pick: 'Eastern Conference', highlight: 'Raptors', highlightLabel: 'Raptors', color: '#ce1141',
    lines: [{ after: 6, label: 'Playoff line' }, { after: 10, label: 'Play-in line' }],
  },
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

/**
 * ESPN labels each football row's zone, but its wording is uneven ("A, B: Relegation; C: ...")
 * and its colour codes are sometimes broken, so this turns a label into a clean name and a kind.
 */
export function zoneOf(note, letter = 'A') {
  const raw = typeof note?.description === 'string' ? note.description : '';
  if (!raw) return null;
  // Nations League labels cover several leagues at once: "A: Qualifies for QFs; B-D: Promotion".
  const covers = (letters) => letters.split(/,\s*/).some((part) => {
    const [from, to = from] = part.split('-');
    return letter >= from.trim() && letter <= to.trim();
  });
  let text = raw;
  for (const segment of raw.split(';')) {
    const match = segment.trim().match(/^([A-D](?:\s*[-,]\s*[A-D])*):\s*(.+)$/);
    if (!match) continue;
    text = covers(match[1]) ? match[2] : '';
    if (text) break;
  }
  const label = text.replace(/\s+-\s+(un)?seeded$/i, '').trim();
  if (!label) return null;
  const kind = /playoff/i.test(label) ? 'playoff' : /relegat|eliminat/i.test(label) ? 'out' : /conference/i.test(label) ? 'uecl'
    : /europa/i.test(label) ? 'uel' : /champions|round of 16|qualif|promot/i.test(label) ? 'ucl' : 'other';
  return { label: label.replace(/^Qualifies for round of 16$/i, 'Round of 16').replace(/^Qualifies for QFs$/i, 'Quarter-finals').replace(/ or playoffs$/i, '').replace(/^Knockout phase playoffs$/i, 'Knockout playoffs'), kind };
}

const statByName = (entry, name) => entry.stats?.find((item) => item.name === name || item.type === name.toLowerCase());

function row(entry, letter = 'A') {
  const team = entry.team ?? {};
  return {
    abbr: team.abbreviation || '',
    logo: team.logos?.[0]?.href || '',
    draws: shown(entry, 'ties'),
    pct: shown(entry, 'winPercent'),
    streak: shown(entry, 'streak'),
    last10: statByName(entry, 'Last Ten Games')?.displayValue ?? '',
    move: num(entry, 'rankChange') ?? 0,
    zone: zoneOf(entry.note, letter),
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
  const result = groups.map((group) => {
    const letter = group.name.match(/^(?:Group|League)\s+([A-D])/i)?.[1]?.toUpperCase() || 'A';
    return { name: group.name, rows: group.entries.map((entry) => row(entry, letter)).sort(byRank(key)) };
  });
  if (!result.length || !result.some((group) => group.rows.length)) throw new Error('No table in the answer');
  // ESPN gives NFL and NBA tables no zones, so the playoff and play-in places are marked here.
  if (league.lines) {
    const [playoffs, playIn] = league.lines;
    for (const group of result) {
      group.rows.forEach((item, index) => {
        const seed = item.seed ?? index + 1;
        if (seed <= playoffs.after) item.zone = { label: 'Playoffs', kind: 'ucl' };
        else if (playIn && seed <= playIn.after) item.zone = { label: 'Play-in', kind: 'playoff' };
      });
    }
  }
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
