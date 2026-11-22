import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME_ROWS, bannerShows, homeLayout, isStandard, layoutData, moveRow, setBanner, setRow } from '../src/homelayout.js';

test('the standard layout: every row in order and on; Top 10 and Trending off in the banner', () => {
  const layout = homeLayout(null);
  assert.deepEqual(layout.rows.map((row) => row.id), HOME_ROWS.map((row) => row.id));
  assert.ok(layout.rows.every((row) => row.on));
  assert.equal(layout.banner.teams, true);
  assert.equal(layout.banner.netflix, false);
  assert.ok(isStandard(layout));
});

test('a saved layout: its order, new rows at the bottom, unknown and repeated ids dropped', () => {
  const layout = homeLayout({ order: ['trending', 'gone', 'continue', 'trending'], hidden: ['onnow', 'gone'], banner: { netflix: true, teams: 'yes' } });
  assert.deepEqual(layout.rows.map((row) => row.id), ['trending', 'continue', 'recent', 'teams', 'fresh', 'onnow', 'netflix']);
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
