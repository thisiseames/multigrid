import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOLD_MS, liveGame, momentOf, noteChance, pickBig } from '../src/redzone.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/redzone-${name}.json`, import.meta.url)));
const nfl = fixture('nfl').events;
const now = Date.parse('2026-11-23T00:30:00Z');

const tweak = (event, change) => {
  const copy = structuredClone(event);
  change(copy);
  return copy;
};

test("ESPN's NFL game, read: teams, scores, clock, win chance", () => {
  const live = nfl.find((event) => event.status.type.state === 'in');
  const game = liveGame(live, 'football/nfl');
  assert.equal(game.sport, 'nfl');
  assert.equal(game.state, 'in');
  assert.ok(game.period >= 1);
  assert.ok(Number.isFinite(game.clock));
  assert.ok(game.home.abbr && game.away.abbr);
  assert.equal(typeof game.homeWin, 'number');
});

test('NFL: the red zone is the strongest moment, with the down and distance', () => {
  const live = nfl.find((event) => event.status.type.state === 'in');
  const inside = tweak(live, (e) => { e.competitions[0].situation = { ...e.competitions[0].situation, isRedZone: true, shortDownDistanceText: '3rd & 6' }; });
  const moment = momentOf(liveGame(inside, 'football/nfl'), [], now);
  assert.equal(moment.kind, 'redzone');
  assert.equal(moment.tag, 'Red zone · 3rd & 6');
  const finished = tweak(inside, (e) => { e.status.type.state = 'post'; });
  assert.equal(momentOf(liveGame(finished, 'football/nfl'), [], now), null);
});

const game = (over) => ({ id: 'g', sport: 'nfl', state: 'in', period: 4, clock: 600, elapsed: 0, home: { abbr: 'H', score: 0 }, away: { abbr: 'A', score: 0 }, redZone: false, downDistance: '', homeWin: null, redCards: [], ...over });

test('close finishes, red cards and swings', () => {
  assert.equal(momentOf(game({ clock: 100, home: { score: 24 }, away: { score: 17 } })).kind, 'nflClose');
  assert.equal(momentOf(game({ clock: 100, home: { score: 31 }, away: { score: 17 } })), null);
  assert.equal(momentOf(game({ sport: 'nba', clock: 150, home: { score: 101 }, away: { score: 99 } })).tag, 'Final 3:00 · 2-point game');
  assert.equal(momentOf(game({ sport: 'nba', period: 3, clock: 150, home: { score: 101 }, away: { score: 99 } })), null);
  assert.equal(momentOf(game({ sport: 'soccer', elapsed: 50 * 60, redCards: [49 * 60] })).kind, 'redCard');
  assert.equal(momentOf(game({ sport: 'soccer', elapsed: 55 * 60, redCards: [49 * 60] })), null);
  assert.equal(momentOf(game({ sport: 'soccer', elapsed: 85 * 60, home: { score: 1 }, away: { score: 1 } })).tag, 'Final 10 min · level');
  const swing = momentOf(game({ homeWin: 0.7 }), [{ at: now - 30_000, homeWin: 0.5 }], now);
  assert.equal(swing.kind, 'swing');
  assert.equal(momentOf(game({ homeWin: 0.7 }), [{ at: now - 90_000, homeWin: 0.5 }], now), null);
  let history = [];
  history = noteChance(history, game({ homeWin: 0.5 }), now - 300_000);
  history = noteChance(history, game({ homeWin: 0.6 }), now);
  assert.equal(history.length, 1);
});

test('who gets the big slot: stronger takes over, equal waits, a quiet game keeps it a minute', () => {
  const red = { strength: 100 };
  const close = { strength: 80 };
  assert.equal(pickBig([{ id: 'a', moment: null }, { id: 'b', moment: close }], null, now), 'b');
  assert.equal(pickBig([{ id: 'a', moment: close }, { id: 'b', moment: red }], { id: 'a', since: now }, now), 'b');
  assert.equal(pickBig([{ id: 'a', moment: close }, { id: 'b', moment: { strength: 80 } }], { id: 'a', since: now - 10 * HOLD_MS }, now), null);
  assert.equal(pickBig([{ id: 'a', moment: null }, { id: 'b', moment: close }], { id: 'a', since: now - 10_000 }, now), null);
  assert.equal(pickBig([{ id: 'a', moment: null }, { id: 'b', moment: close }], { id: 'a', since: now - HOLD_MS }, now), 'b');
  assert.equal(pickBig([{ id: 'a', moment: null }, { id: 'b', moment: null }], { id: 'a', since: 0 }, now), null);
});
