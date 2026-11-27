import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS, MAX_STREAMS, applyPreset, emptyWorkspace, enterCustom, findDividers, fitLiveStage, fitStage, hiddenTiles,
  isPipPreset, isScreenLives, isStream, makeRoom, moveLine, phoneColumn, phoneTile, pipInsetCount, presetById, removeTile, resizeTile, canResize, screenLivesColumns, showHidden, streamCount, swapTiles, visualOrder,
} from '../src/layout.js';

function withStreams(n, presetId = 'equal') {
  const ws = emptyWorkspace();
  for (let i = 0; i < n; i++) {
    ws.tiles.push({ id: `s${i}`, input: `stream${i}`, muted: true, place: { c: 0, r: i, cs: 1, rs: 1 } });
  }
  return applyPreset(ws, presetId);
}

/** Every grid cell is covered by exactly one tile, with no gaps or overlaps. */
function assertTiled(ws, context = '') {
  const seen = ws.rows.map(() => ws.cols.map(() => 0));
  for (const { place } of ws.tiles) {
    if (!place) continue;
    assert.ok(place.cs >= 1 && place.rs >= 1, `${context}: bad span`);
    assert.ok(place.c + place.cs <= ws.cols.length, `${context}: past last column`);
    assert.ok(place.r + place.rs <= ws.rows.length, `${context}: past last row`);
    for (let r = place.r; r < place.r + place.rs; r++) {
      for (let c = place.c; c < place.c + place.cs; c++) seen[r][c]++;
    }
  }
  assert.ok(seen.flat().every((count) => count === 1), `${context}: cells ${JSON.stringify(seen)}`);
}

test('every preset covers the grid exactly, for 0 to 16 streams', () => {
  for (const preset of PRESETS) {
    for (let n = 0; n <= MAX_STREAMS; n++) {
      const ws = withStreams(n, preset.id);
      // Picture in picture puts every screen in one cell on purpose; the grid draws the small ones.
      if (!isPipPreset(preset.id)) assertTiled(ws, `${preset.id} n=${n}`);
      assert.equal(streamCount(ws), n, `${preset.id} n=${n} lost a stream`);
      const visible = ws.tiles.filter((tile) => tile.place).length;
      const hidden = hiddenTiles(ws).length;
      if (preset.fixed) {
        assert.equal(visible, preset.fixed, `${preset.id} n=${n} slots`);
        assert.equal(hidden, Math.max(0, n - preset.fixed), `${preset.id} n=${n} hidden`);
      } else {
        assert.equal(hidden, 0, `${preset.id} n=${n} should show everything`);
      }
    }
  }
});

test('retired layouts are no longer offered but still open saved screens', () => {
  const offered = new Set(PRESETS.map((preset) => preset.id));
  for (const [id, streams] of [['grid4', 16], ['columns', 5], ['pinwheel', 5]]) {
    assert.equal(offered.has(id), false, `${id} should not be in the layout picker`);
    assert.equal(presetById(id)?.id, id, `${id} should still resolve for an old saved layout`);
    const ws = withStreams(streams, id);
    assertTiled(ws, `${id} saved layout`);
    assert.equal(streamCount(ws), streams);
  }
});

test('Bluesky trending videos become the vertical phone column', () => {
  const ws = withStreams(2, 'equal');
  ws.tiles[0].input = 'bluesky:trending';
  phoneColumn(ws, ws.tiles[0].id);
  assert.equal(ws.presetId, 'phone');
  assert.equal(phoneTile(ws)?.id, ws.tiles[0].id);
});

test('a TikTok LIVE becomes the vertical phone column', () => {
  const ws = withStreams(2, 'equal');
  ws.tiles[0].input = 'https://www.tiktok.com/@typicalgamer/live';
  phoneColumn(ws, ws.tiles[0].id);
  assert.equal(ws.presetId, 'phone');
  assert.equal(phoneTile(ws)?.id, ws.tiles[0].id);
});

test('a TikTok profile becomes the vertical phone column', () => {
  const ws = withStreams(2, 'equal');
  ws.tiles[0].input = 'tiktokprofile:@scout2015';
  phoneColumn(ws, ws.tiles[0].id);
  assert.equal(ws.presetId, 'phone');
  assert.equal(phoneTile(ws)?.id, ws.tiles[0].id);
});

test('a TikTok LIVE keeps the phone column over a profile feed', () => {
  const ws = withStreams(2, 'equal');
  ws.tiles[0].input = 'https://www.tiktok.com/@typicalgamer';
  ws.tiles[1].input = 'https://www.tiktok.com/@typicalgamer/live';
  phoneColumn(ws, ws.tiles[1].id);
  assert.equal(phoneTile(ws)?.id, ws.tiles[1].id);
});

test('a REELS website becomes the vertical phone column', () => {
  const ws = withStreams(2, 'equal');
  ws.tiles[0].input = 'https://urlebird.com/trending/';
  ws.tiles[0].reels = true;
  phoneColumn(ws, ws.tiles[0].id);
  assert.equal(ws.presetId, 'phone');
  assert.equal(phoneTile(ws)?.id, ws.tiles[0].id);
});

test('stack is one column and row is one row', () => {
  assert.equal(withStreams(5, 'stack').cols.length, 1);
  assert.equal(withStreams(5, 'stack').rows.length, 5);
  assert.equal(withStreams(5, 'row').rows.length, 1);
  assert.equal(withStreams(5, 'row').cols.length, 5);
});

test('changing preset keeps stream ids, so players are not rebuilt', () => {
  const ws = withStreams(4, 'grid2');
  const ids = ws.tiles.map((tile) => tile.id).sort();
  applyPreset(ws, 'featured');
  assert.deepEqual(ws.tiles.filter(isStream).map((tile) => tile.id).sort(), ids);
});

test('hidden streams return when a roomier preset is chosen', () => {
  const ws = withStreams(4, 'grid2');
  applyPreset(ws, 'single');
  assert.equal(hiddenTiles(ws).length, 3);
  applyPreset(ws, 'grid2');
  assert.equal(hiddenTiles(ws).length, 0);
});

test('swap exchanges places only', () => {
  const ws = withStreams(4, 'grid2');
  const [a, b] = visualOrder(ws);
  const [placeA, placeB] = [a.place, b.place];
  swapTiles(ws, a.id, b.id);
  assert.equal(a.place, placeB);
  assert.equal(b.place, placeA);
  assertTiled(ws);
});

test('custom keeps the arrangement and adds fine tracks', () => {
  const ws = withStreams(3, 'trio');
  const shares = ws.cols[0] / (ws.cols[0] + ws.cols[1]);
  enterCustom(ws);
  assertTiled(ws);
  assert.ok(ws.cols.length >= 12 && ws.rows.length >= 12);
  const first = visualOrder(ws)[0];
  const span = ws.cols.slice(first.place.c, first.place.c + first.place.cs).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(span / ws.cols.reduce((a, b) => a + b, 0) - shares) < 1e-9);
});

test('dividers only appear where tiles meet', () => {
  const ws = enterCustom(withStreams(4, 'grid2'));
  const dividers = findDividers(ws);
  assert.deepEqual(dividers.map((divider) => divider.axis).sort(), ['x', 'x', 'y', 'y']);
  for (const divider of dividers) {
    assert.ok(Math.abs(divider.at - 0.5) < 1e-9);
    assert.ok(Math.abs(divider.to - divider.from - 0.5) < 1e-9, 'one handle per tile edge');
  }
});

test('a divider segment stops where the neighbouring tile spans past it', () => {
  const ws = enterCustom(withStreams(3, 'trio'));
  const horizontal = findDividers(ws).filter((divider) => divider.axis === 'y');
  assert.equal(horizontal.length, 1);
  assert.ok(horizontal[0].from > 0.6);
  assert.equal(horizontal[0].to, 1);
});

test('moving a divider resizes its neighbours, and stops at a minimum', () => {
  const ws = enterCustom(withStreams(4, 'grid2'));
  const { line } = findDividers(ws).find((divider) => divider.axis === 'x');
  moveLine(ws, 'x', line, 0.2);
  const total = ws.cols.reduce((a, b) => a + b, 0);
  const left = ws.cols.slice(0, line).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(left / total - 0.7) < 1e-9);
  moveLine(ws, 'x', line, 5);
  const squeezed = ws.cols.slice(line).reduce((a, b) => a + b, 0) / ws.cols.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(squeezed - 0.08) < 1e-9);
  assertTiled(ws);
});

test('moving a divider leaves other tile edges alone', () => {
  const ws = enterCustom(withStreams(9, 'grid3'));
  const lines = [...new Set(findDividers(ws).filter((divider) => divider.axis === 'x').map((divider) => divider.line))].sort((a, b) => a - b);
  const total = ws.cols.reduce((a, b) => a + b, 0);
  const secondBefore = ws.cols.slice(0, lines[1]).reduce((a, b) => a + b, 0) / total;
  moveLine(ws, 'x', lines[0], 0.1);
  const secondAfter = ws.cols.slice(0, lines[1]).reduce((a, b) => a + b, 0) / total;
  assert.ok(Math.abs(secondBefore - secondAfter) < 1e-9);
});

test('growing a tile trims its neighbour', () => {
  const ws = enterCustom(withStreams(2, 'row'));
  const [left, right] = visualOrder(ws);
  const rect = { ...left.place, cs: left.place.cs + 2 };
  assert.ok(canResize(ws, left.id, rect));
  assert.deepEqual(resizeTile(ws, left.id, rect), []);
  assert.equal(right.place.c, left.place.c + left.place.cs);
  assertTiled(ws);
});

test('shrinking a tile leaves an empty slot, not a hole', () => {
  const ws = enterCustom(withStreams(2, 'row'));
  const [left] = visualOrder(ws);
  const before = ws.tiles.length;
  resizeTile(ws, left.id, { ...left.place, rs: left.place.rs - 4 });
  assert.equal(ws.tiles.length, before + 1);
  assertTiled(ws);
});

test('covering a stream hides it rather than deleting it', () => {
  const ws = enterCustom(withStreams(4, 'grid2'));
  const [first, second] = visualOrder(ws);
  const rect = { ...first.place, cs: first.place.cs + second.place.cs };
  const covered = resizeTile(ws, first.id, rect);
  assert.deepEqual(covered, [second]);
  assert.equal(streamCount(ws), 4);
  assert.equal(hiddenTiles(ws).length, 1);
  assertTiled(ws);
});

test('a resize that would cut a neighbour into an L is refused', () => {
  const ws = enterCustom(withStreams(4, 'grid2'));
  const [first, second] = visualOrder(ws);
  const rect = { ...first.place, cs: first.place.cs + 2, rs: first.place.rs - 2 };
  assert.equal(canResize(ws, first.id, rect), false);
  const middle = { c: second.place.c + 1, r: second.place.r + 1, cs: 1, rs: 1 };
  assert.equal(canResize(ws, first.id, middle), false);
});

test('adding fills a free slot first', () => {
  const ws = withStreams(1, 'grid2');
  const slot = makeRoom(ws);
  assert.equal(isStream(slot), false);
  assert.equal(ws.presetId, 'grid2');
});

test('adding to a full fixed layout moves to Equal so nothing is invisible', () => {
  const ws = withStreams(4, 'grid2');
  const slot = makeRoom(ws);
  assert.equal(ws.presetId, 'equal');
  assert.equal(isStream(slot), false);
  assertTiled(ws);
});

test('adding to a growing layout grows it', () => {
  const ws = withStreams(3, 'stack');
  makeRoom(ws);
  assert.equal(ws.presetId, 'stack');
  assert.equal(ws.rows.length, 4);
});

test('adding to a full custom layout splits the largest tile, up to the limit', () => {
  const ws = enterCustom(withStreams(1, 'single'));
  for (let i = 1; i < MAX_STREAMS; i++) {
    const slot = makeRoom(ws);
    assert.equal(isStream(slot), false);
    slot.input = `stream${i}`;
    assertTiled(ws, `custom add ${i}`);
  }
  assert.equal(streamCount(ws), MAX_STREAMS);
});

test('removing closes up growing layouts, and leaves a slot in fixed ones', () => {
  const growing = withStreams(3, 'stack');
  removeTile(growing, visualOrder(growing)[0].id);
  assert.equal(growing.rows.length, 2);
  const fixed = withStreams(4, 'grid2');
  removeTile(fixed, visualOrder(fixed)[0].id);
  assert.equal(fixed.tiles.length, 4);
  assert.equal(streamCount(fixed), 3);
  assertTiled(fixed);
});

test('removing a tile brings a hidden stream forward', () => {
  const ws = withStreams(3, 'single');
  removeTile(ws, visualOrder(ws)[0].id);
  assert.equal(streamCount(ws), 2);
  assert.equal(hiddenTiles(ws).length, 1);
  assertTiled(ws);
});

test('showing a hidden stream swaps with the last tile', () => {
  const ws = withStreams(2, 'single');
  const [visible] = visualOrder(ws);
  const [hidden] = hiddenTiles(ws);
  const displaced = showHidden(ws, hidden.id);
  assert.equal(displaced, visible);
  assert.equal(visible.place, null);
  assertTiled(ws);
});

test('fit: uniform grids aim for 16:9 and near-misses fill', () => {
  const row = withStreams(3, 'row');
  const size = fitStage(row, 1440, 856, 26);
  assert.equal(size.width, 1440);
  assert.ok(size.height < 400);
  const grid = withStreams(4, 'grid2');
  assert.deepEqual(fitStage(grid, 1440, 856, 26), { width: 1440, height: 856 });
  const custom = enterCustom(withStreams(2, 'row'));
  assert.deepEqual(fitStage(custom, 1000, 700, 26), { width: 1000, height: 700 });
});

test('a wall of TikTok lives fills the stage height with 9:16 bodies', () => {
  const row = withStreams(3, 'row');
  row.tiles.forEach((tile, index) => { tile.input = `tiktoklive:@live${index}`; });
  const live = fitLiveStage(row, 1440, 856, 26);
  assert.equal(live.height, 856);
  assert.ok(live.width < 1440);
  const bodyHeight = 856 - 26;
  assert.ok(Math.abs(live.width / row.cols.length / bodyHeight - 9 / 16) < 0.01);

  const four = withStreams(4, 'row');
  four.tiles.forEach((tile, index) => { tile.input = `tiktoklive:@live${index}`; });
  const wide = fitLiveStage(four, 1440, 856, 26);
  assert.equal(wide.width, 1440);
  assert.ok(wide.height < 856);
  assert.ok(Math.abs(1440 / 4 / (wide.height - 26) - 9 / 16) < 0.01);

  const grid = withStreams(4, 'grid2');
  grid.tiles.forEach((tile, index) => { tile.input = `tiktoklive:@live${index}`; });
  const twoByTwo = fitLiveStage(grid, 1440, 856, 26);
  assert.equal(twoByTwo.height, 856);
  assert.ok(Math.abs(twoByTwo.width / 2 / ((856 - 52) / 2) - 9 / 16) < 0.01);

  const single = withStreams(1, 'single');
  single.tiles[0].input = 'tiktoklive:@solo';
  assert.equal(fitLiveStage(single, 1440, 856, 26).height, 856);

  const mixed = withStreams(3, 'row');
  mixed.tiles[0].input = 'tiktoklive:@live';
  mixed.tiles[1].input = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  mixed.tiles[2].input = 'tiktoklive:@live2';
  assert.equal(fitLiveStage(mixed, 1440, 856, 26), null);

  const pip = withStreams(2, 'pip');
  pip.tiles.forEach((tile, index) => { tile.input = `tiktoklive:@live${index}`; });
  assert.equal(fitLiveStage(pip, 1440, 856, 26), null);
  const custom = enterCustom(withStreams(2, 'row'));
  custom.tiles.forEach((tile, index) => { tile.input = `tiktoklive:@live${index}`; });
  assert.equal(fitLiveStage(custom, 1440, 856, 26), null);
});

test('screen + lives presets put a tall screen left and live columns right', () => {
  const two = withStreams(3, 'screen2');
  assert.equal(two.presetId, 'screen2');
  assert.deepEqual([two.cols.length, two.rows.length], [2, 2]);
  const twoSlots = two.tiles.filter((tile) => tile.place).map((tile) => tile.place);
  assert.deepEqual(twoSlots[0], { c: 0, r: 0, cs: 1, rs: 2 });
  assert.deepEqual(twoSlots.slice(1), [{ c: 1, r: 0, cs: 1, rs: 1 }, { c: 1, r: 1, cs: 1, rs: 1 }]);

  const four = withStreams(5, 'screen4');
  assert.equal(four.presetId, 'screen4');
  assert.deepEqual([four.cols.length, four.rows.length], [3, 2]);
  const fourSlots = four.tiles.filter((tile) => tile.place).map((tile) => tile.place);
  assert.deepEqual(fourSlots[0], { c: 0, r: 0, cs: 1, rs: 2 });
  assert.deepEqual(fourSlots.slice(1), [
    { c: 1, r: 0, cs: 1, rs: 1 }, { c: 2, r: 0, cs: 1, rs: 1 },
    { c: 1, r: 1, cs: 1, rs: 1 }, { c: 2, r: 1, cs: 1, rs: 1 },
  ]);

  assert.deepEqual(screenLivesColumns('screen2', 1440, 856, 26), { columns: 1, liveWidth: 226 });
  assert.deepEqual(screenLivesColumns('screen4', 1440, 856, 26), { columns: 2, liveWidth: 226 });
  assert.deepEqual(screenLivesColumns('row', 1440, 856, 26), null);
  assert.ok(isScreenLives('screen2') && isScreenLives('screen4') && !isScreenLives('screen5'));
});

test('phone layouts keep the primary stream in a video slot, not the phone column', () => {
  const ws = emptyWorkspace();
  ws.tiles.push(
    { id: 'poi', input: 'https://example.com/film', primary: true, muted: true, place: null },
    { id: 'feed', input: 'https://www.tiktok.com/@acyn', muted: true, place: null },
  );
  applyPreset(ws, 'phone', 3);
  const poi = ws.tiles.find((tile) => tile.id === 'poi');
  const feed = ws.tiles.find((tile) => tile.id === 'feed');
  assert.equal(poi.place.r, 0, 'primary should stay in the top video slot');
  assert.equal(poi.place.rs, 1, 'primary should not take the tall phone slot');
  assert.equal(feed.place.rs, 2, 'the feed should own the tall slot');
});

test('picture in picture: one big cell with both screens in it, and the rest waiting in Hidden', () => {
  const ws = withStreams(3, 'pip');
  assert.deepEqual([ws.cols, ws.rows], [[1], [1]]);
  const shown = ws.tiles.filter((tile) => tile.place);
  assert.equal(shown.length, 2);
  assert.ok(shown.every((tile) => JSON.stringify(tile.place) === JSON.stringify({ c: 0, r: 0, cs: 1, rs: 1 })));
  assert.equal(hiddenTiles(ws).length, 1);
});

test('picture in picture ×2: one big cell with all three screens in it, the rest waiting in Hidden', () => {
  const ws = withStreams(4, 'pip2');
  assert.deepEqual([ws.cols, ws.rows], [[1], [1]]);
  const shown = ws.tiles.filter((tile) => tile.place);
  assert.equal(shown.length, 3);
  assert.ok(shown.every((tile) => JSON.stringify(tile.place) === JSON.stringify({ c: 0, r: 0, cs: 1, rs: 1 })));
  assert.equal(hiddenTiles(ws).length, 1);
});

test('picture in picture ×3: one big cell with all four screens in it, the rest waiting in Hidden', () => {
  assert.equal(pipInsetCount('pip3'), 3);
  assert.equal(isPipPreset('pip3'), true);
  const ws = withStreams(5, 'pip3');
  assert.deepEqual([ws.cols, ws.rows], [[1], [1]]);
  const shown = ws.tiles.filter((tile) => tile.place);
  assert.equal(shown.length, 4);
  assert.ok(shown.every((tile) => JSON.stringify(tile.place) === JSON.stringify({ c: 0, r: 0, cs: 1, rs: 1 })));
  assert.equal(hiddenTiles(ws).length, 1);
});

import { fitToStreams } from '../src/layout.js';

test('saving 2 streams from a 5-box layout keeps just the 2, side by side, and leaves the screen alone', () => {
  const ws = withStreams(2, 'duo');
  assert.equal(ws.tiles.filter((tile) => tile.place).length, 5, 'the screen has 5 boxes');
  const saved = fitToStreams(ws);
  assert.equal(saved.tiles.length, 2);
  assert.ok(saved.tiles.every((tile) => tile.input && tile.place));
  assert.equal(saved.presetId, 'equal');
  assertTiled(saved, 'fitted');
  assert.equal(ws.tiles.length, 5, 'the screen itself is unchanged');
  // A layout the streams fill stays exactly as it was.
  const full = withStreams(5, 'duo');
  assert.deepEqual(fitToStreams(full), full);
});
