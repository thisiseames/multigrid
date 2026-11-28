import test from 'node:test';
import assert from 'node:assert/strict';
import { findFotmobFixture, fotmobShots, parseFotmobAttackingZones, parseFotmobHeatmap, parseFotmobPage, parseFotmobWeather, sameTeam } from '../src/fotmob.js';

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
