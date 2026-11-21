import test from 'node:test';
import assert from 'node:assert/strict';
import { chanceText, oddsFor, oddsUrl, parseOdds } from '../src/odds.js';

const nba = { slug: 'nba-por-nyk-2026-11-21', sportsMarketType: 'moneyline', closed: false, endDate: '2026-11-22T00:30:00Z', outcomes: '["Trail Blazers", "Knicks"]', outcomePrices: '["0.405", "0.595"]' };
const soccer = (team, title, price) => ({ slug: `epl-hul-bri-2026-11-22-${team}`, sportsMarketType: 'moneyline', closed: false, endDate: '2026-11-22T14:00:00Z', groupItemTitle: title, outcomes: '["Yes", "No"]', outcomePrices: JSON.stringify([String(price), String(1 - price)]), events: [{ slug: 'epl-hul-bri-2026-11-22' }] });
const epl = [soccer('hul', 'Hull City AFC', 0.135), soccer('draw', 'Draw (Hull City AFC vs. Brighton & Hove Albion FC)', 0.215), soccer('bri', 'Brighton & Hove Albion FC', 0.645)];
const side = (name, full) => ({ name, full });

test('two-team markets and three-way soccer markets both become games', () => {
  const games = parseOdds([nba, ...epl, { ...nba, slug: 'x', sportsMarketType: 'spreads' }, { ...nba, slug: 'y', closed: true }]);
  assert.equal(games.length, 2);
  assert.deepEqual(games[0].sides.map((s) => s.name), ['Trail Blazers', 'Knicks']);
  assert.equal(games[1].draw, 0.215);
  assert.deepEqual(games[1].sides.map((s) => s.chance), [0.135, 0.645]);
});

test('odds go to the right team, whichever order Polymarket lists them in', () => {
  const games = parseOdds([nba, ...epl]);
  const knicks = { start: Date.parse('2026-11-22T00:30:00Z'), home: side('Knicks', 'New York Knicks'), away: side('Trail Blazers', 'Portland Trail Blazers') };
  assert.deepEqual(oddsFor(knicks, games), { home: 0.595, away: 0.405, draw: null });
  const hull = { start: Date.parse('2026-11-22T14:00:00Z'), home: side('Hull', 'Hull City'), away: side('Brighton', 'Brighton & Hove Albion') };
  assert.deepEqual(oddsFor(hull, games), { home: 0.135, away: 0.645, draw: 0.215 });
});

test('a game the sites disagree on the kick-off of still matches by its teams; a missing one does not', () => {
  const games = parseOdds([nba]);
  const moved = { start: Date.parse('2026-11-21T21:25:00Z'), home: side('Knicks', 'New York Knicks'), away: side('Trail Blazers', 'Portland Trail Blazers') };
  assert.ok(oddsFor(moved, games));
  const other = { start: Date.parse('2026-11-22T00:30:00Z'), home: side('Celtics', 'Boston Celtics'), away: side('Kings', 'Sacramento Kings') };
  assert.equal(oddsFor(other, games), null);
  const half = { start: Date.parse('2026-11-22T00:30:00Z'), home: side('Knicks', 'New York Knicks'), away: side('Kings', 'Sacramento Kings') };
  assert.equal(oddsFor(half, games), null);
});

test('chances read plainly', () => {
  assert.equal(chanceText(0.595), '60%');
  assert.equal(chanceText(0.004), '1%');
  assert.equal(chanceText(0.996), '99%');
  assert.equal(chanceText(undefined), '–');
});

test('one small request: only win markets, only around the games', () => {
  const url = new URL(oddsUrl(745, Date.parse('2026-11-21T18:00:00Z'), Date.parse('2026-11-22T03:00:00Z')));
  assert.equal(url.host, 'gamma-api.polymarket.com');
  assert.equal(url.searchParams.get('sports_market_types'), 'moneyline');
  assert.equal(url.searchParams.get('tag_id'), '745');
  assert.ok(Number(url.searchParams.get('limit')) <= 100);
});

test('every sports feature uses exactly your leagues, in the same order', async () => {
  const { MY_LEAGUES } = await import('../src/leagues.js');
  const { TABS, GAME_LEAGUES } = await import('../src/matches.js');
  const { LEAGUES } = await import('../src/standings.js');
  const { ODDS_TAGS } = await import('../src/odds.js');
  const names = MY_LEAGUES.map((league) => league.name);
  assert.ok(names.includes('LaLiga'));
  assert.deepEqual(TABS.filter((tab) => tab.path && !tab.hidden).map((tab) => tab.name), names);
  assert.deepEqual(GAME_LEAGUES.map((league) => league.name), names);
  assert.deepEqual(LEAGUES.map((league) => league.name), names);
  assert.deepEqual(Object.keys(ODDS_TAGS), names);
});
