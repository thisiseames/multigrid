import test from 'node:test';
import assert from 'node:assert/strict';
import { findFotmobFixture, fotmobShots, parseFotmobAttackingZones, parseFotmobGaps, parseFotmobHeatmap, parseFotmobPage, parseFotmobStats, parseFotmobWeather, sameTeam, shotPitchX } from '../src/fotmob.js';

const props = {
  fallback: {
    'team-10260': {
      fixtures: { allFixtures: { fixtures: [
        { id: 1, pageUrl: '/matches/other/abc#1', home: { name: 'Man United' }, away: { name: 'Liverpool' }, status: { utcTime: '2026-11-22T16:00:00Z' } },
        { id: 5795532, pageUrl: '/matches/brentford-vs-manchester-united/3dfzjk#5795532', home: { name: 'Manchester United' }, away: { name: 'Brentford' }, status: { utcTime: '2026-11-28T15:00:00Z' } },
      ] } },
    },
  },
};

test('FotMob finds the same fixture from the team page', () => {
  const match = { start: Date.parse('2026-11-28T15:00:00Z'), home: { name: 'Manchester United' }, away: { name: 'Brentford' } };
  const found = findFotmobFixture(props, match);
  assert.equal(found.id, 5795532);
  assert.equal(found.pageUrl, '/matches/brentford-vs-manchester-united/3dfzjk#5795532');
});

test('FotMob team names accept Man United / Manchester United', () => {
  assert.equal(sameTeam('Man United', 'Manchester United'), true);
  assert.equal(sameTeam('Brentford', 'Brentford FC'), true);
  assert.equal(sameTeam('Brentford', 'Liverpool'), false);
});

test('FotMob attacking zones keep the three shares and halves', () => {
  const zones = parseFotmobAttackingZones({ content: { attackingZones: {
    home: {
      total: { left: 33, center: 34, right: 33 },
      firstHalf: { left: 30, center: 40, right: 30 },
      secondHalf: { left: 36, center: 28, right: 36 },
    },
    away: { total: { left: 42, center: 25, right: 33 } },
  } } });
  assert.deepEqual(zones.home.total, { left: 33, center: 34, right: 33 });
  assert.deepEqual(zones.home.second, { left: 36, center: 28, right: 36 });
  assert.equal(zones.away.first, null);
});

test('FotMob weather is a short, plain phrase', () => {
  const weather = parseFotmobWeather({ content: { weather: { description: 'Rain', temperature: 9.4, windSpeed: 5.2 } } });
  assert.deepEqual(weather, { description: 'Rain', temperature: 9, wind: 5 });
  assert.equal(parseFotmobWeather({}), null);
});

test('FotMob heatmap fills only plain circles into the template', () => {
  const answer = {
    template: '<svg viewBox="0 0 105 68"><g>{{circles__placeholder}}</g></svg>',
    players: {
      a: '<circle cx="52.6" cy="34.1" r="7.5"/>',
      b: '<circle cx="1" cy="2" r="7.5"/><script>alert(1)</script>',
    },
  };
  const svg = parseFotmobHeatmap(answer);
  assert.match(svg, /<circle cx="52.6" cy="34.1" r="7.5"\/>/);
  assert.match(svg, /<circle cx="1" cy="2" r="7.5"\/>/);
  assert.doesNotMatch(svg, /script/);
  assert.equal(parseFotmobHeatmap({ template: '<svg></svg>', players: {} }), '');
  assert.equal(parseFotmobHeatmap({ template: '<svg><script></script></svg>', players: { a: '<circle cx="1" cy="2" r="3"/>' } }), '');
});

test('FotMob gap stats survive duplicate empty rows and periods', () => {
  const item = (key, home, away, raw = true) => ({ key, stats: [home, away], rawStats: raw ? [{ value: home }, { value: away }] : [null, null] });
  const payload = { content: { stats: { Periods: {
    All: { stats: [{ stats: [
      item('expected_goals', null, null, false),
      item('expected_goals', '1.32', '1.06'),
      item('expected_goals_on_target', '0.56', '0.43'),
      item('big_chance', 3, 1),
      item('shots_inside_box', 8, 3),
    ] }] },
    FirstHalf: { stats: [{ stats: [item('expected_goals', '1.32', '1.06'), item('big_chance', 3, 1)] }] },
    SecondHalf: { stats: [{ stats: [item('expected_goals', '0.00', '0.02')] }] },
  } } } };
  const stats = parseFotmobStats(payload);
  assert.equal(stats.source, 'FotMob');
  assert.deepEqual(stats.all.map((row) => [row.key, row.home, row.away]), [
    ['Expected goals', 1.32, 1.06],
    ['Expected goals on target', 0.56, 0.43],
    ['Big chances', 3, 1],
    ['Shots inside box', 8, 3],
  ]);
  assert.equal(stats.first.length, 2);
  assert.deepEqual(stats.second, [{ key: 'Expected goals', label: 'xG', home: 0, away: 0.02, decimals: 2 }]);
});

test('FotMob gaps carry ratings, momentum, referee and weather separately', () => {
  const payload = { content: {
    lineup: {
      homeTeam: { starters: [{ name: 'Senne Lammens', performance: { rating: 4.6 } }, { name: 'Bruno Fernandes', performance: {} }] },
      awayTeam: { starters: [{ name: 'Callum Wilson', performance: { rating: 8.58 } }] },
    },
    stats: { Periods: { All: { stats: [{ stats: [{ key: 'big_chance', stats: [3, 1], rawStats: [{ value: 3 }, { value: 1 }] }] }] } } },
    momentum: { main: { data: [{ minute: 1, value: 0 }, { minute: 2, value: 24 }, { minute: null, value: 3 }] } },
    matchFacts: { infoBox: { Referee: { text: 'Robert Jones' }, Attendance: null } },
  } };
  const gaps = parseFotmobGaps(payload);
  assert.equal(gaps.source, 'FotMob');
  assert.equal(gaps.ratings.home.get('senne lammens'), 4.6);
  assert.equal(gaps.ratings.home.has('bruno fernandes'), false);
  assert.equal(gaps.ratings.away.get('callum wilson'), 8.58);
  assert.deepEqual(gaps.momentum, [[1, 0], [2, 24]]);
  assert.equal(gaps.event.referee.name, 'Robert Jones');
  assert.equal(gaps.event.attendance, null);
});

test('FotMob shots face opposite goals', () => {
  assert.equal(shotPitchX({ side: 'home', x: 96.4 }), 96.4);
  assert.ok(Math.abs(shotPitchX({ side: 'away', x: 86.9 }) - 13.1) < 0.001);
});

test('FotMob page payload and shot map', () => {
  const page = {
    props: { pageProps: {
      general: { homeTeam: { id: 10260 }, awayTeam: { id: 9937 } },
      content: { shotmap: { shots: [
        { x: 96.4, y: 21.1, teamId: 10260, eventType: 'Goal', playerName: 'Joshua Zirkzee', min: 4, expectedGoals: 0.11, isOnTarget: true },
        { x: 80, y: 40, teamId: 9937, eventType: 'Miss', playerName: 'Callum Wilson', min: 20 },
      ] } },
    } },
  };
  const parsed = parseFotmobPage(`<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(page)}</script></html>`);
  assert.equal(parsed.props.pageProps.general.homeTeam.id, 10260);
  assert.deepEqual(fotmobShots(parsed.props.pageProps), [
    { x: 96.4, y: 21.1, side: 'home', goal: true, onTarget: true, player: 'Joshua Zirkzee', minute: 4, xg: 0.11 },
    { x: 80, y: 40, side: 'away', goal: false, onTarget: false, player: 'Callum Wilson', minute: 20, xg: 0 },
  ]);
});
