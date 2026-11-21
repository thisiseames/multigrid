// A game's box score as a tile, from ESPN's free game data (the same source as Game mode).
// NBA: score by quarter and each team's players. NFL: score by quarter, passing, rushing and
// receiving, and team stats. Soccer: goals and cards, team stats side by side, and lineups.
// It updates every 30 seconds while the game is on, and stops once it's over.

import { el } from './ui.js';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';

/** The tile's input: boxscore:<sport path>:<game id>:<name>. */
export const boxScoreInput = (path, id, name) => `boxscore:${path}:${id}:${encodeURIComponent(String(name).slice(0, 80))}`;

const sportOf = (path) => (path.startsWith('soccer') ? 'soccer' : path.includes('nfl') ? 'nfl' : 'nba');

// The columns each sport shows, by ESPN's own labels, and the names they're shown under.
const NBA_COLUMNS = ['MIN', 'PTS', 'REB', 'AST', 'FG', '3PT', 'FT'];
const NFL_TABLES = {
  passing: { title: 'Passing', columns: ['C/ATT', 'YDS', 'TD', 'INT'] },
  rushing: { title: 'Rushing', columns: ['CAR', 'YDS', 'TD', 'LONG'] },
  receiving: { title: 'Receiving', columns: ['REC', 'YDS', 'TD', 'LONG'] },
};
const TEAM_STATS = {
  soccer: [['Possession', 'Possession', (v) => `${Math.round(Number(v))}%`], ['SHOTS', 'Shots'], ['ON GOAL', 'On target'], ['Corner Kicks', 'Corners'], ['Fouls', 'Fouls'], ['Saves', 'Saves'], ['Yellow Cards', 'Yellow cards'], ['Red Cards', 'Red cards']],
  nfl: [['Total Yards', 'Total yards'], ['Passing', 'Passing'], ['Rushing', 'Rushing'], ['3rd down efficiency', '3rd downs'], ['Turnovers', 'Turnovers'], ['Possession', 'Time of possession']],
  nba: [],
};
const EVENT_KINDS = { goal: 'goal', 'own-goal': 'goal', 'penalty---scored': 'goal', 'yellow-card': 'yellow', 'red-card': 'red' };

/** Picks some columns out of a row, by label. */
const pick = (labels, row, wanted) => wanted.map((label) => {
  const at = labels.indexOf(label);
  return at === -1 ? '' : (row[at] ?? '');
});

/** ESPN's game data, shaped for the tile. Anything missing is simply left out. */
export function parseBoxScore(summary, path) {
  const sport = sportOf(path);
  const comp = summary?.header?.competitions?.[0] ?? {};
  const status = comp.status?.type ?? {};
  const sides = (comp.competitors ?? []).map((c) => ({
    id: String(c.team?.id ?? ''),
    abbr: c.team?.abbreviation ?? '',
    // The short name, like the rest of MULTIGRID: Hornets, Man City.
    name: c.team?.shortDisplayName || c.team?.name || c.team?.displayName || '?',
    score: c.score ?? '',
    periods: (c.linescores ?? []).map((line) => String(line.displayValue ?? line.value ?? '')),
    home: c.homeAway === 'home',
  }));
  // Soccer lists the home side first; American sports put the visitors first.
  sides.sort((a, b) => (sport === 'soccer' ? Number(b.home) - Number(a.home) : Number(a.home) - Number(b.home)));
  const box = summary?.boxscore ?? {};

  const players = {};
  for (const team of box.players ?? []) {
    const id = String(team.team?.id ?? '');
    const tables = [];
    for (const stat of team.statistics ?? []) {
      const labels = stat.labels ?? [];
      const rowsOf = (columns) => (stat.athletes ?? [])
        .filter((athlete) => !athlete.didNotPlay && (athlete.stats ?? []).length)
        .map((athlete) => ({ name: athlete.athlete?.shortName || athlete.athlete?.displayName || '', stats: pick(labels, athlete.stats, columns) }));
      if (sport === 'nba') {
        tables.push({ title: '', columns: NBA_COLUMNS, rows: rowsOf(NBA_COLUMNS), totals: stat.totals?.length ? pick(labels, stat.totals, NBA_COLUMNS) : null });
      } else if (sport === 'nfl' && NFL_TABLES[stat.name]) {
        const { title, columns } = NFL_TABLES[stat.name];
        tables.push({ title, columns, rows: rowsOf(columns), totals: null });
      }
    }
    players[id] = tables.filter((table) => table.rows.length);
  }

  const teamStats = [];
  const statsBy = Object.fromEntries((box.teams ?? []).map((team) => [String(team.team?.id ?? ''), Object.fromEntries((team.statistics ?? []).map((stat) => [stat.label, stat.displayValue]))]));
  for (const [label, shown, format = (v) => v] of TEAM_STATS[sport]) {
    const values = sides.map((side) => statsBy[side.id]?.[label]);
    if (values.every((value) => value !== undefined && value !== '')) teamStats.push({ label: shown, values: values.map((value) => format(value)) });
  }

  const events = sport === 'soccer' ? (summary?.keyEvents ?? [])
    .map((event) => ({ kind: EVENT_KINDS[event.type?.type] || '', minute: event.clock?.displayValue || '', teamId: String(event.team?.id ?? ''), who: event.participants?.[0]?.athlete?.displayName || '' }))
    .filter((event) => event.kind && event.who) : [];

  const lineups = sport === 'soccer' ? Object.fromEntries((summary?.rosters ?? []).map((team) => [String(team.team?.id ?? ''),
    (team.roster ?? []).filter((player) => player.starter).map((player) => ({ number: player.jersey || '', name: player.athlete?.displayName || '', position: player.position?.abbreviation || '' }))])) : {};

  return { sport, state: status.state || 'pre', detail: status.shortDetail || status.detail || '', sides, players, teamStats, events, lineups };
}

/** One team's tables. */
// Columns that hold splits like 15-23 or 33/49 need more room than single numbers.
const WIDE = new Set(['FG', '3PT', 'FT', 'C/ATT']);
const cell = (tag, value, column) => el(tag, { class: WIDE.has(column) ? 'is-wide' : '', textContent: value });

function teamTables(tables) {
  return tables.map((table) => el('div', { class: 'bx-table-wrap' },
    table.title ? el('h5', { class: 'bx-sub', textContent: table.title }) : null,
    el('table', { class: 'bx-table' },
      el('thead', {}, el('tr', {}, el('th', { class: 'bx-name', textContent: '' }), ...table.columns.map((column) => cell('th', column, column)))),
      el('tbody', {}, ...table.rows.map((row) => el('tr', {}, el('td', { class: 'bx-name', textContent: row.name }), ...row.stats.map((value, i) => cell('td', value, table.columns[i])))),
        ...(table.totals ? [el('tr', { class: 'bx-total' }, el('td', { class: 'bx-name', textContent: 'Team' }), ...table.totals.map((value, i) => cell('td', value, table.columns[i])))] : [])))));
}

/** Draws the box score into holder. tab is the team shown when the teams take turns (narrow tiles). */
export function renderBoxScore(holder, data, state = { tab: 0 }) {
  const [a, b] = data.sides;
  if (!a || !b) {
    holder.replaceChildren(el('p', { class: 'bx-quiet', textContent: 'This game has no box score yet.' }));
    return;
  }
  const status = data.state === 'in' ? el('span', { class: 'bx-live', textContent: data.detail || 'Live' }) : el('span', { class: 'bx-status', textContent: data.detail });
  const head = el('div', { class: 'bx-head' },
    el('div', { class: 'bx-side' }, el('b', { textContent: a.name }), el('span', { class: 'bx-score', textContent: a.score })),
    status,
    el('div', { class: 'bx-side is-right' }, el('span', { class: 'bx-score', textContent: b.score }), el('b', { textContent: b.name })));
  const parts = [head];

  // Score by quarter (NBA and NFL).
  const periods = Math.max(a.periods.length, b.periods.length);
  if (data.sport !== 'soccer' && periods) {
    const label = (i) => (i < 4 ? `Q${i + 1}` : i === 4 ? 'OT' : `OT${i - 3}`);
    parts.push(el('table', { class: 'bx-table bx-periods' },
      el('thead', {}, el('tr', {}, el('th', { class: 'bx-name' }), ...Array.from({ length: periods }, (_, i) => el('th', { textContent: label(i) })), el('th', { textContent: 'T' }))),
      el('tbody', {}, ...[a, b].map((side) => el('tr', {}, el('td', { class: 'bx-name', textContent: side.abbr || side.name }),
        ...Array.from({ length: periods }, (_, i) => el('td', { textContent: side.periods[i] ?? '' })), el('td', { class: 'bx-t', textContent: side.score }))))));
  }

  // Goals and cards (soccer).
  if (data.events.length) {
    parts.push(el('h4', { class: 'bx-h', textContent: 'Goals and cards' }), el('ul', { class: 'bx-events' }, ...data.events.map((event) => {
      const mine = event.teamId === b.id;
      return el('li', { class: `bx-event${mine ? ' is-right' : ''}` }, el('span', { class: 'bx-minute', textContent: event.minute }), el('span', { class: `bx-mark is-${event.kind}` }), el('span', { textContent: event.who }));
    })));
  }

  // Team stats side by side.
  if (data.teamStats.length) {
    parts.push(el('h4', { class: 'bx-h', textContent: 'Team stats' }), el('div', { class: 'bx-stats' }, ...data.teamStats.map((stat) => el('div', { class: 'bx-stat' },
      el('b', { textContent: stat.values[0] }), el('span', { textContent: stat.label }), el('b', { textContent: stat.values[1] })))));
  }

  // Players (NBA, NFL) or lineups (soccer): side by side in a wide tile, the teams take turns in a narrow one.
  const perTeam = data.sport === 'soccer'
    ? [a, b].map((side) => (data.lineups[side.id]?.length ? [el('ol', { class: 'bx-lineup' }, ...data.lineups[side.id].map((player) => el('li', {}, el('span', { class: 'bx-num', textContent: player.number }), el('span', { textContent: player.name }), el('small', { textContent: player.position }))))] : null))
    : [a, b].map((side) => (data.players[side.id]?.length ? teamTables(data.players[side.id]) : null));
  if (perTeam.some(Boolean)) {
    const tabs = el('div', { class: 'bx-tabs' }, ...[a, b].map((side, i) => el('button', {
      type: 'button',
      class: `bx-tab${state.tab === i ? ' is-on' : ''}`,
      textContent: side.name,
      on: { click() { state.tab = i; renderBoxScore(holder, data, state); } },
    })));
    parts.push(el('h4', { class: 'bx-h', textContent: data.sport === 'soccer' ? 'Lineups' : 'Players' }), tabs,
      el('div', { class: 'bx-teams' }, ...[a, b].map((side, i) => el('section', { class: `bx-team${state.tab === i ? ' is-on' : ''}` },
        el('h5', { class: 'bx-team-name', textContent: side.name }), ...(perTeam[i] ?? [el('p', { class: 'bx-quiet', textContent: 'Not announced yet.' })])))));
  }
  if (parts.length === 1 && data.state === 'pre') parts.push(el('p', { class: 'bx-quiet', textContent: 'The box score fills in once the game starts.' }));
  const scroll = holder.scrollTop;
  holder.replaceChildren(...parts);
  holder.scrollTop = scroll;
}

/** Loads and keeps the tile up to date. Returns a stop function. */
export function runBoxScore(holder, path, id) {
  const state = { tab: 0 };
  let timer = null;
  let stopped = false;
  holder.replaceChildren(el('p', { class: 'bx-quiet', textContent: 'Loading the box score…' }));
  const load = async () => {
    let data = null;
    try {
      const response = await fetch(`${SITE}/${path}/summary?event=${encodeURIComponent(id)}`, { cache: 'no-store', signal: AbortSignal.timeout?.(10000) });
      if (response.ok) data = parseBoxScore(await response.json(), path);
    } catch { /* tried again shortly */ }
    if (stopped) return;
    if (data) renderBoxScore(holder, data, state);
    else if (!holder.querySelector('.bx-head')) holder.replaceChildren(el('p', { class: 'bx-quiet', textContent: "The box score didn't load. Trying again shortly." }));
    // Every 30 seconds while the game is on (or still unknown), every five minutes before it; none after.
    if (data?.state === 'post') return;
    timer = setTimeout(load, data?.state === 'pre' ? 300000 : 30000);
  };
  load();
  return () => { stopped = true; clearTimeout(timer); };
}
