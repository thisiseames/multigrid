import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS, MAX_STREAMS, applyPreset, emptyWorkspace, enterCustom, findDividers, fitStage, hiddenTiles,
  isStream, makeRoom, moveLine, removeTile, resizeTile, canResize, showHidden, streamCount, swapTiles, visualOrder,
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
      assertTiled(ws, `${preset.id} n=${n}`);
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
