import test from 'node:test';
import assert from 'node:assert/strict';
import { TABS, formationRows, parseLineups, toMatch, inWindow, isMine } from '../src/matches.js';

test('games include the Bundesliga and Ligue 1 tabs', () => {
  assert.deepEqual(
    TABS.filter((tab) => tab.id === 'bundesliga' || tab.id === 'ligue1').map((tab) => [tab.name, tab.path]),
    [['Bundesliga', 'soccer/ger.1'], ['Ligue 1', 'soccer/fra.1']],
  );
});

test('games read the same from the scoreboard and from a team schedule', () => {
  const scoreboard = toMatch({ id: '1', date: '2026-11-24T20:00Z', status: { type: { state: 'pre', shortDetail: 'Scheduled' } }, competitions: [{ competitors: [
    { homeAway: 'away', team: { displayName: 'Borussia Dortmund', shortDisplayName: 'Dortmund' }, score: '0' },
    { homeAway: 'home', team: { displayName: 'Arsenal', shortDisplayName: 'Arsenal' }, score: '0' },
  ], broadcasts: [{ names: ['Paramount+'] }] }] }, 'UCL');
  assert.equal(scoreboard.home.name, 'Arsenal');
  assert.deepEqual(scoreboard.tv, ['Paramount+']);
  const schedule = toMatch({ id: '2', date: '2026-11-15T21:25Z', competitions: [{ status: { type: { state: 'post', shortDetail: 'Final' } }, competitors: [
    { homeAway: 'home', team: { displayName: 'Dallas Cowboys', shortDisplayName: 'Cowboys' }, score: { displayValue: '17' } },
    { homeAway: 'away', team: { displayName: 'San Francisco 49ers', shortDisplayName: '49ers' }, score: { displayValue: '24' }, winner: true },
  ], broadcasts: [{ media: { shortName: 'Fox' } }] }] });
  assert.equal(schedule.away.score, '24');
  assert.equal(schedule.away.winner, true);
  assert.deepEqual(schedule.tv, ['Fox']);
  assert.equal(isMine(schedule.away), true);
});

test('the window keeps yesterday through two weeks ahead, in order', () => {
  const now = Date.parse('2026-11-15T18:00:00');
  const at = (iso) => ({ id: iso, start: Date.parse(iso), home: {}, away: {} });
  const kept = inWindow([at('2026-11-28T12:00:00'), at('2026-11-14T12:00:00'), at('2026-11-12T12:00:00'), at('2026-12-15T12:00:00')], now);
  assert.deepEqual(kept.map((match) => match.id), ['2026-11-14T12:00:00', '2026-11-28T12:00:00']);
});

const starter = (jersey, name, position, formationPlace, subbedIn = false, subbedOut = false) => ({
  starter: true,
  jersey: String(jersey),
  position: { abbreviation: position },
  formationPlace,
  subbedIn,
  subbedOut,
  athlete: { displayName: name, shortName: name.split(' ').length > 1 ? `${name[0]}. ${name.split(' ').slice(1).join(' ')}` : name },
});
const sub = (jersey, name, position) => ({ ...starter(jersey, name, position, 0), starter: false });

test('lineups: ESPN rosters become starters and substitutes', () => {
  const answer = {
    rosters: [
      {
        homeAway: 'home',
        team: { displayName: 'Manchester United' },
        formation: '4-2-3-1',
        roster: [
          starter(1, 'Senne Lammens', 'G', 1),
          starter(6, 'Lisandro Martínez', 'CD-L', 6),
          starter(5, 'Harry Maguire', 'CD-R', 5),
          starter(23, 'Luke Shaw', 'LB', 3),
          starter(2, 'Diogo Dalot', 'RB', 2),
          starter(8, 'Bruno Fernandes', 'AM', 10),
          starter(37, 'Kobbie Mainoo', 'LM', 4),
          starter(18, 'Youri Tielemans', 'RM', 8),
          starter(10, 'Matheus Cunha', 'F', 9),
          starter(9, 'Marcus Rashford', 'AM-L', 11),
          starter(19, 'Bryan Mbeumo', 'AM-R', 7),
          sub(26, 'Ayden Heaven', 'SUB'),
          sub(3, 'Noussair Mazraoui', 'SUB'),
        ],
      },
      {
        homeAway: 'away',
        team: { displayName: 'Liverpool' },
        formation: '4-3-3',
        roster: [
          starter(1, 'Alisson Becker', 'G', 1),
          starter(2, 'Joe Gomez', 'RB', 2),
          starter(4, 'Virgil van Dijk', 'CD-R', 5),
          starter(5, 'Ibrahima Konate', 'CD-L', 6),
          starter(26, 'Andy Robertson', 'LB', 3),
          starter(10, 'Alexis Mac Allister', 'CM', 6),
          starter(8, 'Dominik Szoboszlai', 'CM', 9),
          starter(38, 'Ryan Gravenberch', 'CM', 4),
          starter(11, 'Mohamed Salah', 'RW', 7),
          starter(9, 'Darwin Nunez', 'ST', 8),
          starter(18, 'Cody Gakpo', 'LW', 11),
          sub(62, 'Caoimhin Kelleher', 'SUB'),
        ],
      },
    ],
  };
  const lineups = parseLineups(answer);
  assert.equal(lineups.length, 2);
  assert.equal(lineups[0].home, true);
  assert.equal(lineups[0].formation, '4-2-3-1');
  assert.equal(lineups[0].starters.length, 11);
  assert.equal(lineups[0].subs.length, 2);
  assert.equal(lineups[0].starters[0].short, 'S. Lammens');
  assert.equal(lineups[0].starters[0].jersey, '1');
  assert.deepEqual(parseLineups({ rosters: [{ homeAway: 'home', formation: null, roster: [] }] }), []);
});

test('lineups: 4-2-3-1 becomes goalkeeper, four, two, three and one', () => {
  const parsed = parseLineups({ rosters: [{
    homeAway: 'home',
    team: { displayName: 'Manchester United' },
    formation: '4-2-3-1',
    roster: [
      starter(1, 'Senne Lammens', 'G', 1),
      starter(6, 'Lisandro Martínez', 'CD-L', 6),
      starter(5, 'Harry Maguire', 'CD-R', 5),
      starter(23, 'Luke Shaw', 'LB', 3),
      starter(2, 'Diogo Dalot', 'RB', 2),
      starter(8, 'Bruno Fernandes', 'AM', 10),
      starter(37, 'Kobbie Mainoo', 'LM', 4),
      starter(18, 'Youri Tielemans', 'RM', 8),
      starter(10, 'Matheus Cunha', 'F', 9),
      starter(9, 'Marcus Rashford', 'AM-L', 11),
      starter(19, 'Bryan Mbeumo', 'AM-R', 7),
    ],
  }] })[0];
  const rows = formationRows(parsed.formation, parsed.starters);
  assert.deepEqual(rows.map((row) => row.length), [1, 4, 2, 3, 1]);
  assert.deepEqual(rows[1].map((player) => player.name), ['Luke Shaw', 'Lisandro Martínez', 'Harry Maguire', 'Diogo Dalot']);
  assert.deepEqual(rows[2].map((player) => player.name), ['Kobbie Mainoo', 'Youri Tielemans']);
  assert.deepEqual(rows[3].map((player) => player.name), ['Marcus Rashford', 'Bruno Fernandes', 'Bryan Mbeumo']);
  assert.equal(rows[4][0].name, 'Matheus Cunha');
});

test('lineups: wing-backs join the five in a 3-5-2', () => {
  const p = (name, position, formationPlace) => ({ name, short: name, jersey: '', position, formationPlace });
  const players = [
    p('Keeper', 'G', 1),
    p('Left Centre', 'CD-L', 4),
    p('Centre', 'CB', 5),
    p('Right Centre', 'CD-R', 6),
    p('Left Wing Back', 'LWB', 2),
    p('Right Wing Back', 'RWB', 3),
    p('Mid One', 'CM', 8),
    p('Mid Two', 'CM', 10),
    p('Mid Three', 'CM', 14),
    p('Striker One', 'ST', 9),
    p('Striker Two', 'ST', 11),
  ];
  const rows = formationRows('3-5-2', players);
  assert.deepEqual(rows.map((row) => row.length), [1, 3, 5, 2]);
  assert.deepEqual(rows[1].map((player) => player.name), ['Left Centre', 'Centre', 'Right Centre']);
  assert.deepEqual(rows[2].map((player) => player.name), ['Left Wing Back', 'Mid One', 'Mid Two', 'Mid Three', 'Right Wing Back']);
});

import { teamCard } from '../src/matches.js';

test('a team card keeps every game still to come, not just the next three, for This week', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  const side = (name) => ({ name, full: name === 'TOR' ? 'Toronto Raptors' : name, logo: '', color: '', score: '' });
  const games = [1, 2, 3, 4, 5].map((day) => ({ id: String(day), start: now + day * 86400000, state: 'pre', home: side('TOR'), away: side(`Team ${day}`), tv: [] }));
  games.push({ id: 'old', start: now - 2 * 86400000, state: 'post', home: side('TOR'), away: side('Old'), tv: [] });
  const card = teamCard('Raptors', games, now);
  assert.equal(card.next.length, 3);
  assert.deepEqual(card.upcoming.map((game) => game.id), ['1', '2', '3', '4', '5']);
});

import { gameOrder, groupGames } from '../src/matches.js';

test('Game mode: your teams first, then each league; live, then later today, then just finished', () => {
  const now = Date.parse('2026-11-22T17:00:00Z');
  const s = (name) => ({ name, full: name, logo: '', color: '', score: '0' });
  const g = (id, state, hour, home, away) => ({ id, state, start: Date.parse(`2026-11-22T${String(hour).padStart(2, '0')}:00:00Z`), home: s(home), away: s(away), tv: [] });
  const groups = groupGames([
    { name: 'Premier League', games: [g('a', 'post', 12, 'Arsenal', 'Spurs'), g('f', 'post', 15, 'Brentford', 'Wolves'), g('b', 'in', 16, 'Liverpool', 'Manchester United'), g('c', 'pre', 19, 'Chelsea', 'Everton'), g('d', 'in', 16, 'Leeds', 'Fulham')] },
    { name: 'NFL', games: [g('e', 'pre', 18, 'Bears', 'Lions'), { ...g('old', 'post', 1, 'Old', 'Game'), start: Date.parse('2026-11-20T18:00:00Z') }] },
    { name: 'NBA', games: [] },
  ], now);
  assert.deepEqual(groups.map((group) => [group.title, group.games.map((game) => game.id)]), [
    ['Your teams', ['b']],
    // Arsenal–Spurs ended hours ago, so it's gone; Brentford–Wolves only just finished.
    ['Premier League', ['d', 'c', 'f']],
    ['NFL', ['e']],
  ]);
  // Finished games: the latest first.
  assert.ok(gameOrder(g('x', 'post', 14, 'A', 'B'), g('y', 'post', 12, 'C', 'D')) < 0);
});

test('a finished game drops out of Game mode about 45 minutes after it ends', async () => {
  const { isLongOver } = await import('../src/matches.js');
  const kick = Date.parse('2026-11-22T12:00:00Z');
  const at = (minutes) => kick + minutes * 60000;
  assert.equal(isLongOver({ state: 'post', start: kick, sport: 'soccer/all' }, at(150)), false);
  assert.equal(isLongOver({ state: 'post', start: kick, sport: 'soccer/all' }, at(170)), true);
  assert.equal(isLongOver({ state: 'post', start: kick, sport: 'basketball/nba' }, at(190)), false);
  assert.equal(isLongOver({ state: 'post', start: kick, sport: 'football/nfl' }, at(250)), true);
  assert.equal(isLongOver({ state: 'in', start: kick, sport: 'soccer/all' }, at(400)), false);
});

import { shortClock } from '../src/matches.js';

test('a live clock is written the short way, so it fits beside the logos', () => {
  assert.equal(shortClock('0.1 - 4th'), 'Q4 0.1');
  assert.equal(shortClock('4:12 - 3rd'), 'Q3 4:12');
  assert.equal(shortClock('2:05 - OT'), 'OT 2:05');
  assert.equal(shortClock('1:00 - 2OT'), '2OT 1:00');
  assert.equal(shortClock('End of 3rd Quarter'), 'End Q3');
  assert.equal(shortClock('Halftime'), 'HT');
  assert.equal(shortClock("86'"), "86'");
  assert.equal(shortClock(''), '');
});
