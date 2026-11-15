import test from 'node:test';
import assert from 'node:assert/strict';
import { toMatch, inWindow, isMine } from '../src/matches.js';

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
