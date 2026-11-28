import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, parseSofascoreMomentum, parseSofascorePositions, parseSofascoreRatings, parseSofascoreStats, sofascoreEvents } from '../src/sofascore.js';

test('SofaScore gaps: xG and big chances by period', () => {
  const answer = {
    statistics: [
      { period: 'ALL', groups: [{ statisticsItems: [
        { name: 'Expected goals', home: '0.91', away: '0.42' },
        { name: 'Big chances', home: '3', away: '0' },
        { name: 'Passes', home: '149', away: '131' },
      ] }] },
      { period: '1ST', groups: [{ statisticsItems: [
        { name: 'Expected goals', home: '0.91', away: '0.42' },
        { name: 'Big chances', home: '3', away: '0' },
      ] }] },
    ],
  };
  const stats = parseSofascoreStats(answer);
  assert.deepEqual(stats.all, [
    { key: 'Expected goals', label: 'xG', home: 0.91, away: 0.42, decimals: 2 },
    { key: 'Big chances', label: 'Big chances', home: 3, away: 0, decimals: 0 },
  ]);
  assert.equal(stats.first.length, 2);
  assert.deepEqual(stats.second, []);
});

test('SofaScore ratings use normalized player names', () => {
  const lineups = {
    home: { players: [
      { player: { name: 'Senne Lammens' }, statistics: { rating: 6.3 } },
      { player: { name: 'Bruno Fernandes' }, statistics: { rating: 7.1 } },
      { player: { name: 'No Rating' }, statistics: {} },
    ] },
    away: { players: [{ player: { name: 'Callum Wilson' }, statistics: { rating: 7.24 } }] },
  };
  const ratings = parseSofascoreRatings(lineups);
  assert.equal(ratings.home.get(normalizeName('Senne Lammens')), 6.3);
  assert.equal(ratings.home.get(normalizeName('Bruno Fernandes')), 7.1);
  assert.equal(ratings.home.has(normalizeName('No Rating')), false);
  assert.equal(ratings.away.get(normalizeName('Callum Wilson')), 7.24);
});

test('SofaScore average positions map by player name', () => {
  const positions = parseSofascorePositions({
    home: {
      0: { player: { name: 'Senne Lammens' }, averageX: 9.54, averageY: 52.73 },
      1: { player: { name: 'Patrick Dorgu' }, averageX: 61.26, averageY: 77.12 },
    },
    away: { 0: { player: { name: 'Caoimhin Kelleher' }, averageX: 9.46, averageY: 50.81 } },
  });
  assert.deepEqual(positions.home.get(normalizeName('Senne Lammens')), { x: 9.54, y: 52.73 });
  assert.deepEqual(positions.away.get(normalizeName('Caoimhin Kelleher')), { x: 9.46, y: 50.81 });
  assert.equal(positions.home.size, 2);
});

test('SofaScore momentum keeps minute/value points', () => {
  const points = parseSofascoreMomentum({ graphPoints: [{ minute: 1, value: -8 }, { minute: 2, value: 4 }, { minute: null, value: 2 }] });
  assert.deepEqual(points, [[1, -8], [2, 4]]);
});

test('SofaScore search keeps event entities, not the wrapper', () => {
  const events = sofascoreEvents({ results: [
    { type: 'event', entity: { id: 16363672, homeTeam: { name: 'Manchester United' }, awayTeam: { name: 'Brentford' }, startTimestamp: 1795878000 } },
    { type: 'team', entity: { id: 35, name: 'Manchester United' } },
  ] });
  assert.equal(events.length, 1);
  assert.equal(events[0].id, 16363672);
  assert.equal(events[0].homeTeam.name, 'Manchester United');
});

test('SofaScore team names normalize', () => {
  assert.equal(normalizeName('Manchester United FC'), 'manchester united');
  assert.equal(normalizeName('Brighton & Hove Albion'), 'brighton and hove albion');
});
