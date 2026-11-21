import test from 'node:test';
import assert from 'node:assert/strict';

// boxscore.js shares ui.js, which listens on the page; a stand-in page is enough here.
globalThis.document ??= { addEventListener() {} };
globalThis.window ??= { addEventListener() {} };
const { parseBoxScore, boxScoreInput } = await import('../src/boxscore.js');
const { parseSource } = await import('../src/sources.js');

// Shaped like ESPN's game data for real games on Nov 20–21, 2026, cut down.
const team = (id, abbreviation, shortDisplayName) => ({ id, abbreviation, shortDisplayName, displayName: shortDisplayName });
const header = (state, detail, competitors) => ({ competitions: [{ status: { type: { state, shortDetail: detail } }, competitors }] });

test('NBA: visitors first, quarters, each team\'s players in fixed columns, no one who didn\'t play, team totals', () => {
  const labels = ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'TO', 'STL', 'BLK', 'OREB', 'DREB', 'PF', '+/-'];
  const data = parseBoxScore({
    header: header('post', 'Final', [
      { homeAway: 'home', team: team('1', 'ATL', 'Hawks'), score: '111', linescores: [{ displayValue: '23' }, { displayValue: '33' }, { displayValue: '31' }, { displayValue: '24' }] },
      { homeAway: 'away', team: team('30', 'CHA', 'Hornets'), score: '97', linescores: [{ displayValue: '31' }, { displayValue: '26' }, { displayValue: '19' }, { displayValue: '21' }] },
    ]),
    boxscore: { players: [{ team: { id: '30' }, statistics: [{ labels, totals: ['', '97', '38-94', '11-45', '10-16', '49', '22', '17', '4', '1', '20', '29', '20', ''], athletes: [
      { athlete: { shortName: 'M. Diabate' }, starter: true, stats: ['30', '21', '9-12', '0-0', '3-5', '15', '2', '4', '1', '0', '8', '7', '1', '+5'] },
      { athlete: { shortName: 'H. Steinbach' }, didNotPlay: true, stats: [] },
    ] }] }] },
  }, 'basketball/nba');
  assert.deepEqual(data.sides.map((side) => [side.abbr, side.score, side.periods.join(' ')]), [['CHA', '97', '31 26 19 21'], ['ATL', '111', '23 33 31 24']]);
  const [table] = data.players['30'];
  assert.deepEqual(table.columns, ['MIN', 'PTS', 'REB', 'AST', 'FG', '3PT', 'FT']);
  assert.deepEqual(table.rows, [{ name: 'M. Diabate', stats: ['30', '21', '15', '2', '9-12', '0-0', '3-5'] }]);
  assert.deepEqual(table.totals, ['', '97', '49', '22', '38-94', '11-45', '10-16']);
});

test('NFL: passing, rushing and receiving, and team stats side by side', () => {
  const data = parseBoxScore({
    header: header('post', 'Final', [
      { homeAway: 'home', team: team('33', 'BAL', 'Ravens'), score: '20', linescores: [] },
      { homeAway: 'away', team: team('24', 'LAC', 'Chargers'), score: '23', linescores: [] },
    ]),
    boxscore: {
      players: [{ team: { id: '24' }, statistics: [
        { name: 'passing', labels: ['C/ATT', 'YDS', 'AVG', 'TD', 'INT', 'SACKS', 'QBR', 'RTG'], athletes: [{ athlete: { displayName: 'Justin Herbert' }, stats: ['12/18', '129', '7.2', '0', '0', '2-2', '60.1', '87.5'] }] },
        { name: 'fumbles', labels: ['FUM'], athletes: [{ athlete: { displayName: 'X' }, stats: ['1'] }] },
      ] }],
      teams: [
        { team: { id: '33' }, statistics: [{ label: 'Total Yards', displayValue: '287' }, { label: 'Turnovers', displayValue: '0' }, { label: 'Possession', displayValue: '30:02' }] },
        { team: { id: '24' }, statistics: [{ label: 'Total Yards', displayValue: '301' }, { label: 'Turnovers', displayValue: '1' }, { label: 'Possession', displayValue: '29:58' }] },
      ],
    },
  }, 'football/nfl');
  assert.deepEqual(data.players['24'].map((table) => [table.title, table.rows[0].stats]), [['Passing', ['12/18', '129', '0', '0']]]);
  assert.deepEqual(data.teamStats, [
    { label: 'Total yards', values: ['301', '287'] },
    { label: 'Turnovers', values: ['1', '0'] },
    { label: 'Time of possession', values: ['29:58', '30:02'] },
  ]);
});

test('Soccer: home first, goals and cards with the minute, team stats, starting lineups', () => {
  const data = parseBoxScore({
    header: header('post', 'FT', [
      { homeAway: 'home', team: team('382', 'MNC', 'Man City'), score: '1' },
      { homeAway: 'away', team: team('370', 'FUL', 'Fulham'), score: '1' },
    ]),
    keyEvents: [
      { type: { type: 'kickoff' }, clock: { displayValue: '' } },
      { type: { type: 'yellow-card' }, clock: { displayValue: "7'" }, team: { id: '370' }, participants: [{ athlete: { displayName: 'Alex Iwobi' } }] },
      { type: { type: 'goal' }, clock: { displayValue: "16'" }, team: { id: '370' }, participants: [{ athlete: { displayName: 'Rodrigo Muniz' } }, { athlete: { displayName: 'Oscar Bobb' } }] },
    ],
    boxscore: { teams: [
      { team: { id: '382' }, statistics: [{ label: 'Possession', displayValue: '58.5' }, { label: 'SHOTS', displayValue: '15' }] },
      { team: { id: '370' }, statistics: [{ label: 'Possession', displayValue: '41.5' }, { label: 'SHOTS', displayValue: '9' }] },
    ] },
    rosters: [{ team: { id: '382' }, roster: [{ starter: true, jersey: '31', athlete: { displayName: 'Ederson' }, position: { abbreviation: 'G' } }, { starter: false, jersey: '18', athlete: { displayName: 'Sub' } }] }],
  }, 'soccer/all');
  assert.deepEqual(data.sides.map((side) => side.abbr), ['MNC', 'FUL']);
  assert.deepEqual(data.events, [{ kind: 'yellow', minute: "7'", teamId: '370', who: 'Alex Iwobi' }, { kind: 'goal', minute: "16'", teamId: '370', who: 'Rodrigo Muniz' }]);
  assert.deepEqual(data.teamStats, [{ label: 'Possession', values: ['59%', '42%'] }, { label: 'Shots', values: ['15', '9'] }]);
  assert.deepEqual(data.lineups['382'], [{ number: '31', name: 'Ederson', position: 'G' }]);
});

test('a box score tile link reads back as a tile, and anything malformed is refused', () => {
  const source = parseSource(boxScoreInput('basketball/nba', '401909305', 'Hornets at Hawks'));
  assert.deepEqual([source.ok, source.kind, source.path, source.gameId, source.label], [true, 'boxscore', 'basketball/nba', '401909305', 'Box score · Hornets at Hawks']);
  assert.equal(parseSource('boxscore:nope').ok, false);
  assert.equal(parseSource('boxscore:basketball/nba:abc:x').ok, false);
});
