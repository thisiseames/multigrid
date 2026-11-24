import test from 'node:test';
import assert from 'node:assert/strict';
import { DAYPARTS, HOME_ROWS, bannerShows, daypartFor, daypartOrder, homeLayout, isStandard, layoutData, moveRow, setBanner, setRow } from '../src/homelayout.js';

test('the standard layout: every row in order and on; Ten, Top 10 and Trending off in the banner', () => {
  const layout = homeLayout(null);
  assert.deepEqual(layout.rows.map((row) => row.id), HOME_ROWS.map((row) => row.id));
  assert.ok(layout.rows.every((row) => row.on));
  assert.equal(layout.banner.teams, true);
  assert.equal(layout.banner.ten, false);
  assert.equal(layout.banner.netflix, false);
  assert.ok(isStandard(layout));
});

test('a saved layout: its order, The Ten after On now, unknown and repeated ids dropped', () => {
  const layout = homeLayout({ order: ['trending', 'gone', 'continue', 'trending'], hidden: ['onnow', 'gone'], banner: { netflix: true, teams: 'yes' } });
  assert.deepEqual(layout.rows.map((row) => row.id), ['trending', 'continue', 'recent', 'teams', 'fresh', 'onnow', 'ten', 'netflix']);
  assert.equal(layout.rows.find((row) => row.id === 'onnow').on, false);
  assert.equal(layout.banner.netflix, true);
  assert.equal(layout.banner.teams, true);
  assert.deepEqual(layoutData(layout).hidden, ['onnow']);
  assert.deepEqual(homeLayout('nonsense').rows.length, HOME_ROWS.length);
});

test('moving, hiding and the banner', () => {
  let layout = homeLayout(null);
  layout = moveRow(layout, 'trending', -1);
  assert.deepEqual(layout.rows.slice(-2).map((row) => row.id), ['trending', 'netflix']);
  assert.equal(moveRow(layout, 'continue', -1), layout);
  assert.equal(moveRow(layout, 'netflix', 1), layout);
  layout = setRow(layout, 'continue', false);
  assert.equal(bannerShows(layout, 'continue'), false);
  assert.equal(bannerShows(layout, 'teams'), true);
  layout = setBanner(setRow(layout, 'continue', true), 'teams', false);
  assert.equal(bannerShows(layout, 'teams'), false);
  assert.equal(isStandard(layout), false);
});

test('dayparts cover the whole local day and change at 5, 11, 17 and 23', () => {
  const at = (hour, minute = 0) => new Date(2026, 10, 24, hour, minute);
  assert.equal(daypartFor(at(4, 59)).id, 'late');
  assert.equal(daypartFor(at(5)).id, 'morning');
  assert.equal(daypartFor(at(10, 59)).id, 'morning');
  assert.equal(daypartFor(at(11)).id, 'afternoon');
  assert.equal(daypartFor(at(16, 59)).id, 'afternoon');
  assert.equal(daypartFor(at(17)).id, 'prime');
  assert.equal(daypartFor(at(22, 59)).id, 'prime');
  assert.equal(daypartFor(at(23)).id, 'late');
  assert.equal(daypartFor(at(0)).id, 'late');
  assert.deepEqual(DAYPARTS.map((part) => part.id), ['morning', 'afternoon', 'prime', 'late']);
});

test('a daypart orders only the rows that are switched on', () => {
  const layout = homeLayout({ order: ['ten', 'continue'], hidden: ['teams'] });
  const visible = layout.rows.filter((row) => row.on);
  const prime = daypartFor(new Date(2026, 10, 24, 20));
  assert.deepEqual(daypartOrder(prime, visible).map((row) => row.id), ['onnow', 'ten', 'netflix', 'trending', 'fresh', 'continue', 'recent']);
  const all = homeLayout(null).rows.filter((row) => row.on);
  assert.deepEqual(daypartOrder(prime, all).map((row) => row.id), ['teams', 'onnow', 'ten', 'netflix', 'trending', 'fresh', 'continue', 'recent']);
  assert.deepEqual(daypartOrder(daypartFor(new Date(2026, 10, 24, 8)), all).map((row) => row.id), ['continue', 'teams', 'fresh', 'onnow', 'ten', 'netflix', 'trending', 'recent']);
});
