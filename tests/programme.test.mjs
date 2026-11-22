import test from 'node:test';
import assert from 'node:assert/strict';
import { dangerMan, formOf, lastMeeting, lastResult, outcomeOf } from '../src/programme.js';

const match = (date, state, homeId, homeScore, awayId, awayScore) => ({
  date,
  competitions: [{
    status: { type: { state } },
    competitors: [
      { homeAway: 'home', team: { id: homeId, displayName: 'Home' }, score: homeScore },
      { homeAway: 'away', team: { id: awayId, displayName: 'Away' }, score: awayScore },
    ],
  }],
});

test('form reads the opponent’s last results, oldest first', () => {
  const events = [
    match('2026-10-01T12:00Z', 'post', '104', 2, '9', 1),
    match('2026-10-08T12:00Z', 'post', '9', 3, '104', 0),
    match('2026-10-15T12:00Z', 'post', '104', 1, '9', 1),
    match('2026-10-22T12:00Z', 'pre', '104', null, '9', null),
  ];
  assert.deepEqual(formOf(events, '104'), ['W', 'L', 'D']);
  const objects = [match('2026-10-01T12:00Z', 'post', '104', { displayValue: '2' }, '9', { displayValue: '1' })];
  assert.deepEqual(formOf(objects, '104'), ['W']);
  assert.equal(lastResult(objects, '104').score, '2–1');
  assert.deepEqual(lastResult(events, '104'), {
    result: 'D', date: Date.parse('2026-10-15T12:00Z'), opponent: 'Away', score: '1–1', home: true,
  });
  assert.equal(outcomeOf(events[3], '104'), '');
});

test('the last meeting comes from the head-to-head block', () => {
  const series = [{
    type: 'head-to-head',
    events: [
      { date: '2025-01-01T12:00Z', status: { type: { state: 'post' } }, competitors: [
        { homeAway: 'home', team: { id: '360', displayName: 'Man Utd' }, score: '1' },
        { homeAway: 'away', team: { id: '104', displayName: 'Roma' }, score: '0' },
      ] },
      { date: '2026-05-01T12:00Z', status: { type: { state: 'post' } }, competitors: [
        { homeAway: 'home', team: { id: '360', displayName: 'Man Utd' }, score: '2' },
        { homeAway: 'away', team: { id: '104', displayName: 'Roma' }, score: '1' },
      ] },
    ],
  }];
  assert.deepEqual(lastMeeting(series, '360'), {
    date: Date.parse('2026-05-01T12:00Z'),
    home: 'Man Utd', away: 'Roma', homeScore: 2, awayScore: 1,
    result: 'W', mine: 'Man Utd', other: 'Roma',
  });
});

test('the danger man is the opponent’s top shooter', () => {
  const summary = { leaders: [{ team: { id: '104' }, leaders: [
    { name: 'goalsLeaders', displayName: 'Goals', leaders: [{ athlete: { displayName: 'Paulo Dybala' }, displayValue: 'Matches: 4, Goals: 5' }] },
    { name: 'totalShots', displayName: 'Total Shots', leaders: [{ athlete: { displayName: 'Paulo Dybala' }, displayValue: '15' }] },
  ] }] };
  assert.deepEqual(dangerMan(summary, '104'), { name: 'Paulo Dybala', value: '5', stat: 'goals' });
  assert.equal(dangerMan({ leaders: [] }, '104'), null);
});
