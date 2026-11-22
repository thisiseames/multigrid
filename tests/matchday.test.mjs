import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BUILDUP_LEAD, addChance, chancePath, clubVideos, countdownText, findBroadcast, fulltimeAt, fulltimeHoldUntil,
  isCalledOff, isFulltimeHold, listingNames, markFulltime, ordinal, parseSummary, phaseOf, pickMatches, resultFor, tableMove, teamNames,
} from '../src/matchday.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const MINUTE = 60000;
const HOUR = 60 * MINUTE;
// Liverpool v Man United, Sun Nov 22, 2026, 11:30 am Toronto (16:30 UTC).
const kickoff = Date.parse('2026-11-22T16:30:00Z');
const at = (iso) => Date.parse(iso);
const game = (state, start = kickoff, detail = '') => ({ id: '401878755', start, state, detail, home: { id: '364', name: 'Liverpool', full: 'Liverpool' }, away: { id: '360', name: 'Man United', full: 'Manchester United' } });

test('the parts of match day, and when the build-up takes over', () => {
  // Earlier in the day: the game only leads the rotation.
  assert.equal(phaseOf(game('pre'), at('2026-11-22T12:00:00Z')), 'early');
  // Two hours before kick-off it takes the banner over.
  assert.equal(phaseOf(game('pre'), kickoff - BUILDUP_LEAD - MINUTE), 'early');
  assert.equal(phaseOf(game('pre'), kickoff - BUILDUP_LEAD), 'buildup');
  // TV coverage starting sooner (a 3 pm game whose show starts at 12:30) starts it then.
  const three = at('2026-11-22T20:00:00Z');
  assert.equal(phaseOf(game('pre', three), three - 2.5 * HOUR, three - 2.5 * HOUR), 'buildup');
  assert.equal(phaseOf(game('pre', three), three - 2.5 * HOUR), 'early');
  // A listing from the night before doesn't count.
  assert.equal(phaseOf(game('pre', three), three - 7 * HOUR, three - 7 * HOUR), 'early');
  assert.equal(phaseOf(game('in'), kickoff + 30 * MINUTE), 'live');
  assert.equal(phaseOf(game('post'), kickoff + 3 * HOUR), 'fulltime');
  assert.equal(phaseOf(game('pre', kickoff, 'Postponed'), kickoff - HOUR), 'fulltime');
  assert.equal(isCalledOff(game('post', kickoff, 'Postponed')), true);
  // The next day it's over.
  assert.equal(phaseOf(game('post'), at('2026-11-23T14:00:00Z')), 'off');
  assert.equal(phaseOf(null), 'off');
});

test("today's game and the next one", () => {
  const next = { ...game('pre', at('2026-11-28T15:00:00Z')), id: 'brentford' };
  const last = { ...game('post', at('2026-11-08T14:00:00Z')), id: 'villa' };
  const { today, next: after } = pickMatches([next, game('pre'), last], at('2026-11-22T13:00:00Z'));
  assert.equal(today.id, '401878755');
  assert.equal(after.id, 'brentford');
  const tomorrow = pickMatches([next, game('post'), last], at('2026-11-23T13:00:00Z'));
  assert.equal(tomorrow.today, null);
  assert.equal(tomorrow.next.id, 'brentford');
});

test('countdowns and places', () => {
  assert.equal(countdownText(84 * MINUTE), '1 h 24 min');
  assert.equal(countdownText(2 * HOUR), '2 h');
  assert.equal(countdownText(8 * MINUTE), '8 min');
  assert.equal(countdownText(20000), 'Under a minute');
  assert.equal(countdownText(5 * 24 * HOUR + HOUR), '5 days');
  assert.equal(countdownText(-1), 'Now');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  assert.equal(tableMove(14, 11), 'Up to 11th');
  assert.equal(tableMove(9, 12), 'Down to 12th');
  assert.equal(tableMove(9, 9), 'Stay 9th');
  assert.equal(tableMove(0, 9), '9th');
});

test("ESPN's match file before kick-off: form, table, videos, news, no line-ups yet", () => {
  const data = parseSummary(fixture('matchday-pre.json'));
  assert.equal(data.match.home.name, 'Liverpool');
  assert.equal(data.match.away.id, '360');
  assert.equal(data.match.state, 'pre');
  assert.equal(data.match.venue, 'Anfield');
  assert.equal(data.league.slug, 'eng.1');
  // Oldest first, as the screen reads left to right.
  assert.deepEqual(data.form.away, ['L', 'L', 'L', 'W', 'D']);
  assert.deepEqual(data.form.home, ['W', 'W', 'L', 'L', 'W']);
  assert.ok(data.positions.home.rank >= 1 && data.positions.away.rank >= 1);
  assert.ok(data.videos.length && data.videos.every((video) => video.url.startsWith('https://') && video.url.endsWith('.mp4')));
  assert.ok(data.news.length && data.news.every((article) => article.url.startsWith('https://')));
  assert.deepEqual(data.lineups, []);
  assert.deepEqual(data.timeline, []);
  assert.deepEqual(data.stats, []);
});

test("ESPN's match file during a game: timeline, stats, commentary newest first, line-ups", () => {
  const data = parseSummary(fixture('matchday-live.json'));
  assert.equal(data.match.state, 'in');
  const kinds = data.timeline.map((item) => item.kind);
  assert.ok(kinds.includes('yellow') && kinds.includes('sub') && kinds.includes('break'));
  const sub = data.timeline.find((item) => item.kind === 'sub');
  assert.ok(sub.player && sub.off && sub.minute && ['home', 'away'].includes(sub.side));
  const card = data.timeline.find((item) => item.kind === 'yellow');
  assert.equal(card.player, 'L. Vuskovic');
  assert.equal(card.side, 'away');
  assert.ok(data.stats.find((stat) => stat.name === 'possessionPct'));
  const shots = data.stats.find((stat) => stat.name === 'totalShots');
  assert.ok(Number.isFinite(shots.home) && Number.isFinite(shots.away));
  const minutes = data.commentary.map((line) => line.minute);
  assert.ok(data.commentary.length > 0 && minutes[0] !== '');
  assert.equal(data.lineups.length, 2);
  assert.ok(data.lineups.every((side) => side.starters.length === 11 && side.formation));
  assert.equal(parseSummary({}), null);
});

test('goals, own goals and penalties in the timeline', () => {
  const answer = fixture('matchday-live.json');
  const home = answer.header.competitions[0].competitors.find((team) => team.homeAway === 'home').team.id;
  answer.keyEvents = [
    { type: { text: 'Goal - Header' }, scoringPlay: true, clock: { displayValue: "23'" }, team: { id: home }, participants: [{ athlete: { displayName: 'Mohamed Salah' } }, { athlete: { displayName: 'Florian Wirtz' } }] },
    { type: { text: 'Penalty - Scored' }, scoringPlay: true, clock: { displayValue: "58'" }, team: { id: '999' }, participants: [{ athlete: { displayName: 'Bruno Fernandes' } }] },
    { type: { text: 'Own Goal' }, scoringPlay: true, clock: { displayValue: "81'" }, team: { id: '999' }, participants: [{ athlete: { displayName: 'Virgil van Dijk' } }] },
    { type: { text: 'Red Card' }, clock: { displayValue: "88'" }, team: { id: home }, participants: [{ athlete: { displayName: 'Ibrahima Konate' } }] },
  ];
  const [salah, bruno, own, red] = parseSummary(answer).timeline;
  assert.deepEqual([salah.kind, salah.player, salah.assist, salah.side, salah.note], ['goal', 'M. Salah', 'F. Wirtz', 'home', '']);
  assert.deepEqual([bruno.note, bruno.side], ['pen', 'away']);
  assert.equal(own.note, 'OG');
  assert.equal(red.kind, 'red');
});

test('finding the channel showing the game in your TV guide', () => {
  const match = game('pre');
  assert.deepEqual(teamNames(match.away).sort(), ['man united', 'man utd', 'manchester united', 'manchester utd'].sort());
  assert.ok(listingNames('Live PL: Liverpool v Man United', match));
  assert.ok(listingNames('Super Sunday: Liverpool v Man Utd', match));
  assert.ok(!listingNames('PL: Chelsea v Leeds United Hlts', match));
  assert.ok(!listingNames('Liverpool v Brighton', match));
  const listings = {
    'SKY SPORTS PREMIER LEAGUE': [{ title: 'Live PL: Liverpool v Man United', start: kickoff - 30 * MINUTE, end: kickoff + 3 * HOUR, live: false }],
    'SKY SPORTS MAIN EVENT': [{ title: 'Live PL: Liverpool v Man United', start: kickoff - 30 * MINUTE, end: kickoff + 3 * HOUR, live: false }],
    'SKY SPORTS NEWS': [{ title: 'Liverpool v Man United: The Reaction', start: kickoff + 3 * HOUR, end: kickoff + 4 * HOUR }],
  };
  const favorites = Object.keys(listings).map((name) => ({ name, input: name }));
  const found = findBroadcast(match, favorites, (favorite) => listings[favorite.name]);
  assert.equal(found.favorite.name, 'SKY SPORTS PREMIER LEAGUE');
  assert.equal(found.start, kickoff - 30 * MINUTE);
  assert.equal(findBroadcast(match, [{ name: 'SKY SPORTS NEWS' }], (favorite) => listings[favorite.name]), null);
  assert.equal(findBroadcast(null, favorites, () => []), null);
});

test('the win-chance story: a point a minute, drawn as a line', () => {
  let points = [];
  points = addChance(points, kickoff, { home: 0.55, draw: 0.23, away: 0.22 });
  points = addChance(points, kickoff + 20000, { home: 0.56, draw: 0.23, away: 0.21 });
  assert.equal(points.length, 1, 'a second point inside the minute replaces the first');
  points = addChance(points, kickoff + 60 * MINUTE, { home: 0.3, draw: 0.3, away: 0.4 });
  assert.equal(points.length, 2);
  assert.equal(addChance(points, kickoff, null).length, 2);
  const path = chancePath(points, 'away', { width: 105, height: 100, start: kickoff });
  assert.match(path, /^M0\.3,79\.0 L60\.0,60\.0$/);
  assert.equal(chancePath(points.slice(0, 1), 'away'), '');
});

test('the club uploads worth showing: recent, and not the academy', () => {
  const now = Date.parse('2026-11-22T16:00:00Z');
  const videos = clubVideos([
    { id: 'aaaaaaaaaaa', title: 'Mauricio Pochettino Pre-Liverpool | Press Conference', published: now - 24 * HOUR },
    { id: 'bbbbbbbbbbb', title: 'Academy Highlights | Man Utd U18s 2-3 Derby County', published: now - 2 * HOUR },
    { id: 'ccccccccccc', title: 'Full Match | Man Utd U18s v Derby County', published: now - 2 * HOUR },
    { id: 'ddddddddddd', title: 'Inside Training', published: now - 3 * HOUR },
    { id: 'eeeeeeeeeee', title: 'Old', published: now - 10 * 24 * HOUR },
    { id: 'bad', title: 'No id', published: now },
  ], now);
  assert.deepEqual(videos.map((video) => video.id), ['ddddddddddd', 'aaaaaaaaaaa']);
});

test("a result from the team's side", () => {
  const done = { ...game('post'), home: { ...game('post').home, score: '1' }, away: { ...game('post').away, score: '2' } };
  assert.equal(resultFor(done, '360'), 'W');
  assert.equal(resultFor(done, '364'), 'L');
  assert.equal(resultFor({ ...done, away: { ...done.away, score: '1' } }, '360'), 'D');
  assert.equal(resultFor(game('in'), '360'), '');
});

test('a line-up with only G/D/M/F: sides and lines from the formation places', async () => {
  const { formationRows } = await import('../src/matches.js');
  const player = (name, position, formationPlace) => ({ name, short: name, position, formationPlace });
  // Man United v Liverpool, Nov 22, 2026, as ESPN sent it.
  const starters = [
    player('Lammens', 'G', 1), player('Yoro', 'D', 2), player('de Ligt', 'D', 5), player('Martinez', 'D', 6), player('Dalot', 'D', 3),
    player('Tielemans', 'M', 8), player('Mainoo', 'M', 4), player('Cunha', 'M', 11), player('Dorgu', 'M', 7), player('Fernandes', 'M', 10), player('Mbeumo', 'F', 9),
  ];
  const rows = formationRows('4-2-3-1', starters).map((row) => row.map((one) => one.name));
  // Each row left to right, from the team's own view.
  assert.deepEqual(rows, [['Lammens'], ['Dalot', 'Martinez', 'de Ligt', 'Yoro'], ['Mainoo', 'Tielemans'], ['Cunha', 'Fernandes', 'Dorgu'], ['Mbeumo']]);
});

test('the full-time card holds for two hours, then rejoins the rotation', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
  const id = '401878755';
  const start = kickoff;
  const seen = at('2026-11-22T18:25:00Z');
  assert.equal(fulltimeAt(id), 0);
  assert.equal(fulltimeHoldUntil(id, start), start + 4 * HOUR, 'fallback: kick-off + 2 h, then 2 h hold');
  assert.equal(isFulltimeHold(id, start, at('2026-11-22T19:30:00Z')), true);
  assert.equal(isFulltimeHold(id, start, at('2026-11-22T20:31:00Z')), false);
  assert.equal(markFulltime(id, seen), seen);
  assert.equal(fulltimeAt(id), seen);
  assert.equal(fulltimeHoldUntil(id, start), seen + 2 * HOUR);
  assert.equal(isFulltimeHold(id, start, at('2026-11-22T20:20:00Z')), true);
  assert.equal(isFulltimeHold(id, start, at('2026-11-22T20:26:00Z')), false);
});
