// Layout engine: pure data, no DOM.
//
// A layout is a CSS Grid described by data. `cols` and `rows` are track sizes (fr units),
// and each tile has a `place` of { c, r, cs, rs }: its first column, first row, and how
// many tracks it spans. Presets just generate that data, so nothing downstream knows
// about templates. A tile with `place: null` is hidden; a tile with `input: null` is an
// empty slot.

export const MAX_STREAMS = 16;
const FINE_TRACKS = 12; // Custom layouts are refined to at least this many tracks per axis.
const MIN_LINE_SHARE = 0.08; // A divider can't squeeze a region below this share of the stage.

let counter = 0;
export const uid = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

const units = (n) => Array(n).fill(1);

function cells(c, r) {
  const slots = [];
  for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) slots.push({ c: x, r: y, cs: 1, rs: 1 });
  return { cols: units(c), rows: units(r), slots };
}

const EQUAL_SHAPES = [[1, 1], [2, 1], [2, 2], [2, 2], [3, 2], [3, 2], [3, 3], [3, 3], [3, 3], [4, 3], [4, 3], [4, 3], [4, 4], [4, 4], [4, 4], [4, 4]];

function featured(n) {
  const small = Math.max(n - 1, 3);
  if (small <= 3) {
    return {
      cols: [3, 1],
      rows: units(3),
      slots: [{ c: 0, r: 0, cs: 1, rs: 3 }, { c: 1, r: 0, cs: 1, rs: 1 }, { c: 1, r: 1, cs: 1, rs: 1 }, { c: 1, r: 2, cs: 1, rs: 1 }],
    };
  }
  // The big tile sits top-left and small tiles wrap around it in an L.
  let k = 3;
  while (2 * k - 1 < small) k++;
  const slots = [{ c: 0, r: 0, cs: k - 1, rs: k - 1 }];
  for (let r = 0; r < k - 1; r++) slots.push({ c: k - 1, r, cs: 1, rs: 1 });
  for (let c = 0; c < k; c++) slots.push({ c, r: k - 1, cs: 1, rs: 1 });
  return { cols: units(k), rows: units(k), slots };
}

function focusRow(n) {
  const small = Math.max(n - 1, 3);
  const perRow = Math.min(small, 5);
  const smallRows = Math.ceil(small / perRow);
  const rows = [perRow - 1, ...units(smallRows)];
  const slots = [{ c: 0, r: 0, cs: perRow, rs: 1 }];
  for (let i = 0; i < perRow * smallRows; i++) {
    slots.push({ c: i % perRow, r: 1 + Math.floor(i / perRow), cs: 1, rs: 1 });
  }
  return { cols: units(perRow), rows, slots };
}

/**
 * `build(n)` returns tracks and slots for n streams. A preset with `fixed` always has that
 * many slots; the rest grow with the number of streams.
 */
export const PRESETS = [
  { id: 'single', name: 'Single', fixed: 1, build: () => cells(1, 1) },
  { id: 'equal', name: 'Equal', hint: 'Fits to your streams', sample: 6, build: (n) => {
    const [c, r] = EQUAL_SHAPES[Math.min(Math.max(n, 1), MAX_STREAMS) - 1];
    return cells(c, r);
  } },
  { id: 'stack', name: 'Vertical stack', sample: 3, build: (n) => cells(1, Math.max(n, 2)) },
  { id: 'row', name: 'Horizontal row', sample: 3, build: (n) => cells(Math.max(n, 2), 1) },
  { id: 'grid2', name: '2 × 2', fixed: 4, build: () => cells(2, 2) },
  { id: 'grid3', name: '3 × 3', fixed: 9, build: () => cells(3, 3) },
  { id: 'grid4', name: '4 × 4', fixed: 16, build: () => cells(4, 4) },
  { id: 'featured', name: 'Featured', hint: 'One big, the rest small', sample: 6, build: featured },
  { id: 'focus', name: 'Focus and row', sample: 4, build: focusRow },
  { id: 'trio', name: 'One and two', fixed: 3, build: () => ({
    cols: [2, 1],
    rows: units(2),
    slots: [{ c: 0, r: 0, cs: 1, rs: 2 }, { c: 1, r: 0, cs: 1, rs: 1 }, { c: 1, r: 1, cs: 1, rs: 1 }],
  }) },
  { id: 'duo', name: 'Two and three', fixed: 5, build: () => ({
    cols: units(6),
    rows: [3, 2],
    slots: [
      { c: 0, r: 0, cs: 3, rs: 1 }, { c: 3, r: 0, cs: 3, rs: 1 },
      { c: 0, r: 1, cs: 2, rs: 1 }, { c: 2, r: 1, cs: 2, rs: 1 }, { c: 4, r: 1, cs: 2, rs: 1 },
    ],
  }) },
  { id: 'columns', name: 'Two beside three', fixed: 5, build: () => ({
    cols: [2, 1],
    rows: units(6),
    slots: [
      { c: 0, r: 0, cs: 1, rs: 3 }, { c: 0, r: 3, cs: 1, rs: 3 },
      { c: 1, r: 0, cs: 1, rs: 2 }, { c: 1, r: 2, cs: 1, rs: 2 }, { c: 1, r: 4, cs: 1, rs: 2 },
    ],
  }) },
  { id: 'pinwheel', name: 'Pinwheel', fixed: 5, build: () => ({
    cols: units(3),
    rows: units(3),
    slots: [
      { c: 0, r: 0, cs: 2, rs: 1 }, { c: 2, r: 0, cs: 1, rs: 2 }, { c: 1, r: 2, cs: 2, rs: 1 },
      { c: 0, r: 1, cs: 1, rs: 2 }, { c: 1, r: 1, cs: 1, rs: 1 },
    ],
  }) },
];

export const presetById = (id) => PRESETS.find((preset) => preset.id === id);

/** What to draw for a preset's little diagram. */
export function presetDiagram(preset) {
  return preset.build(preset.fixed ?? preset.sample ?? 1);
}

export const isStream = (tile) => Boolean(tile.input);
export const isVisible = (tile) => Boolean(tile.place);
export const streamCount = (ws) => ws.tiles.filter(isStream).length;
export const hiddenTiles = (ws) => ws.tiles.filter((tile) => isStream(tile) && !isVisible(tile));

const byPosition = (a, b) => a.place.r - b.place.r || a.place.c - b.place.c;

/** Every tile on the grid in reading order, empty slots included. */
export const visualOrder = (ws) => ws.tiles.filter(isVisible).sort(byPosition);

const orderedStreams = (ws) => [...visualOrder(ws).filter(isStream), ...hiddenTiles(ws)];

export function emptyWorkspace() {
  return { v: 1, presetId: 'equal', minSlots: 0, started: false, fit: true, cols: [1], rows: [1], tiles: [] };
}

const emptyTile = (place) => ({ id: uid(), input: null, muted: true, volume: 100, place });

/** Pours the streams into a preset. Any that don't fit stay in the workspace, hidden. */
export function applyPreset(ws, presetId, minSlots = 0) {
  const preset = presetById(presetId);
  const streams = orderedStreams(ws);
  const { cols, rows, slots } = preset.build(Math.max(streams.length, minSlots));
  ws.presetId = presetId;
  ws.minSlots = minSlots;
  ws.started = true;
  ws.fit = true;
  ws.cols = [...cols];
  ws.rows = [...rows];
  ws.tiles = slots.map((place, index) => (
    index < streams.length ? Object.assign(streams[index], { place: { ...place } }) : emptyTile({ ...place })
  ));
  for (const extra of streams.slice(slots.length)) {
    extra.place = null;
    ws.tiles.push(extra);
  }
  return ws;
}

/** Swaps two tiles' positions. Used for drag to reorder; no tile is rebuilt. */
export function swapTiles(ws, idA, idB) {
  const a = ws.tiles.find((tile) => tile.id === idA);
  const b = ws.tiles.find((tile) => tile.id === idB);
  if (!a || !b || a === b || !a.place || !b.place) return ws;
  [a.place, b.place] = [b.place, a.place];
  return ws;
}

/** Switches to custom mode, adding finer tracks so spans have somewhere to go. */
export function enterCustom(ws) {
  ws.presetId = 'custom';
  ws.fit = false;
  ws.started = true;
  const refine = (tracks, startKey, spanKey) => {
    const factor = Math.max(1, Math.ceil(FINE_TRACKS / tracks.length));
    for (const tile of ws.tiles) {
      if (!tile.place) continue;
      tile.place[startKey] *= factor;
      tile.place[spanKey] *= factor;
    }
    return tracks.flatMap((size) => Array(factor).fill(size / factor));
  };
  ws.cols = refine(ws.cols, 'c', 'cs');
  ws.rows = refine(ws.rows, 'r', 'rs');
  return ws;
}

const sum = (list) => list.reduce((total, value) => total + value, 0);
const axisKeys = (axis) => (axis === 'x'
  ? { tracks: 'cols', start: 'c', span: 'cs', crossStart: 'r', crossSpan: 'rs' }
  : { tracks: 'rows', start: 'r', span: 'rs', crossStart: 'c', crossSpan: 'cs' });

/** Track lines that actually separate tiles. */
function usedLines(ws, axis) {
  const { start, span } = axisKeys(axis);
  const lines = new Set();
  for (const tile of ws.tiles) {
    if (!tile.place) continue;
    lines.add(tile.place[start]);
    lines.add(tile.place[start] + tile.place[span]);
  }
  return [...lines].sort((a, b) => a - b);
}

/** Dividers to draw: each is a stretch of a track line with tiles on either side. */
export function findDividers(ws) {
  const dividers = [];
  for (const axis of ['x', 'y']) {
    const { tracks, start, span, crossStart, crossSpan } = axisKeys(axis);
    const crossTracks = axis === 'x' ? ws.rows : ws.cols;
    const crossTotal = sum(crossTracks);
    const total = sum(ws[tracks]);
    const crossOffset = (index) => sum(crossTracks.slice(0, index)) / crossTotal;
    for (let line = 1; line < ws[tracks].length; line++) {
      const ranges = ws.tiles
        .filter((tile) => tile.place && (tile.place[start] === line || tile.place[start] + tile.place[span] === line))
        .map((tile) => [tile.place[crossStart], tile.place[crossStart] + tile.place[crossSpan]])
        .sort((a, b) => a[0] - b[0]);
      if (!ranges.length) continue;
      let [from, to] = ranges[0];
      const push = () => dividers.push({
        axis,
        line,
        at: sum(ws[tracks].slice(0, line)) / total,
        from: crossOffset(from),
        to: crossOffset(to),
      });
      for (const [nextFrom, nextTo] of ranges.slice(1)) {
        // Stretches that only touch stay separate, so each gets its own grab handle
        // rather than two dividers' handles landing on the same crossing point.
        if (nextFrom >= to) {
          push();
          [from, to] = [nextFrom, nextTo];
        } else {
          to = Math.max(to, nextTo);
        }
      }
      push();
    }
  }
  return dividers;
}

/**
 * Moves a divider by `share` of the stage. Tracks between this line and the neighbouring
 * real edges are scaled to absorb it, so no tile elsewhere changes size.
 */
export function moveLine(ws, axis, line, share) {
  const tracks = ws[axisKeys(axis).tracks];
  const total = sum(tracks);
  const used = usedLines(ws, axis);
  const before = Math.max(0, ...used.filter((value) => value < line));
  const after = Math.min(tracks.length, ...used.filter((value) => value > line));
  const left = sum(tracks.slice(before, line));
  const right = sum(tracks.slice(line, after));
  const floor = Math.min(total * MIN_LINE_SHARE, left, right);
  const delta = Math.max(floor - left, Math.min(right - floor, share * total));
  for (let i = before; i < line; i++) tracks[i] *= (left + delta) / left;
  for (let i = line; i < after; i++) tracks[i] *= (right - delta) / right;
  return ws;
}

const overlaps = (a, b) => a.c < b.c + b.cs && b.c < a.c + a.cs && a.r < b.r + b.rs && b.r < a.r + a.rs;
const contains = (outer, inner) => inner.c >= outer.c && inner.r >= outer.r
  && inner.c + inner.cs <= outer.c + outer.cs && inner.r + inner.rs <= outer.r + outer.rs;

/** What's left of `tile` once `rect` is taken away, or null if that isn't a rectangle. */
function trimmed(tile, rect) {
  const t = { ...tile };
  const spansRows = rect.r <= t.r && rect.r + rect.rs >= t.r + t.rs;
  const spansCols = rect.c <= t.c && rect.c + rect.cs >= t.c + t.cs;
  if (spansRows && rect.c <= t.c) return { ...t, c: rect.c + rect.cs, cs: t.c + t.cs - rect.c - rect.cs };
  if (spansRows && rect.c + rect.cs >= t.c + t.cs) return { ...t, cs: rect.c - t.c };
  if (spansCols && rect.r <= t.r) return { ...t, r: rect.r + rect.rs, rs: t.r + t.rs - rect.r - rect.rs };
  if (spansCols && rect.r + rect.rs >= t.r + t.rs) return { ...t, rs: rect.r - t.r };
  return null;
}

/** Can tile `id` take over `rect`? Neighbours must be trimmable or fully covered. */
export function canResize(ws, id, rect) {
  if (rect.cs < 1 || rect.rs < 1) return false;
  return ws.tiles.every((tile) => {
    if (tile.id === id || !tile.place || !overlaps(tile.place, rect)) return true;
    return contains(rect, tile.place) || trimmed(tile.place, rect) !== null;
  });
}

/** Covers uncovered cells with as few rectangles as a simple sweep finds. */
function fillHoles(ws) {
  const taken = ws.rows.map(() => ws.cols.map(() => false));
  for (const { place } of ws.tiles) {
    if (!place) continue;
    for (let r = place.r; r < place.r + place.rs; r++) {
      for (let c = place.c; c < place.c + place.cs; c++) taken[r][c] = true;
    }
  }
  for (let r = 0; r < ws.rows.length; r++) {
    for (let c = 0; c < ws.cols.length; c++) {
      if (taken[r][c]) continue;
      let cs = 1;
      while (c + cs < ws.cols.length && !taken[r][c + cs]) cs++;
      let rs = 1;
      while (r + rs < ws.rows.length && taken[r + rs].slice(c, c + cs).every((value) => !value)) rs++;
      for (let y = r; y < r + rs; y++) for (let x = c; x < c + cs; x++) taken[y][x] = true;
      ws.tiles.push(emptyTile({ c, r, cs, rs }));
    }
  }
}

/** Resizes a tile's spans. Returns any streams that were fully covered and so hidden. */
export function resizeTile(ws, id, rect) {
  if (!canResize(ws, id, rect)) return [];
  const covered = [];
  ws.tiles = ws.tiles.filter((tile) => {
    if (tile.id === id || !tile.place || !overlaps(tile.place, rect)) return true;
    if (contains(rect, tile.place)) {
      if (!isStream(tile)) return false;
      tile.place = null;
      covered.push(tile);
      return true;
    }
    tile.place = trimmed(tile.place, rect);
    return true;
  });
  ws.tiles.find((tile) => tile.id === id).place = { ...rect };
  fillHoles(ws);
  return covered;
}

/** Adds a track by splitting an existing one in two, keeping every tile where it is. */
function splitTrack(ws, axis, index) {
  const { tracks, start, span } = axisKeys(axis);
  const size = ws[tracks][index];
  ws[tracks].splice(index, 1, size / 2, size / 2);
  for (const { place } of ws.tiles) {
    if (!place) continue;
    if (place[start] > index) place[start]++;
    else if (place[start] + place[span] > index) place[span]++;
  }
}

/** Custom mode with no free slot: halves the largest tile to make room. */
function splitLargest(ws) {
  const colTotal = sum(ws.cols);
  const rowTotal = sum(ws.rows);
  const sizeOf = ({ place }) => ({
    w: sum(ws.cols.slice(place.c, place.c + place.cs)) / colTotal,
    h: sum(ws.rows.slice(place.r, place.r + place.rs)) / rowTotal,
  });
  const area = (tile) => sizeOf(tile).w * sizeOf(tile).h;
  const target = ws.tiles.filter(isVisible).sort((a, b) => area(b) - area(a))[0];
  const { w, h } = sizeOf(target);
  const axis = w * 16 >= h * 9 ? 'x' : 'y';
  const { start, span } = axisKeys(axis);
  if (target.place[span] === 1) splitTrack(ws, axis, target.place[start]);
  const half = Math.floor(target.place[span] / 2);
  const other = { ...target.place, [start]: target.place[start] + half, [span]: target.place[span] - half };
  target.place[span] = half;
  const tile = emptyTile(other);
  ws.tiles.push(tile);
  return tile;
}

/**
 * Finds the slot a new stream should go in, reshaping the layout when the current one is
 * full. Returns the empty tile to fill. The caller checks MAX_STREAMS first.
 */
export function makeRoom(ws) {
  const free = () => visualOrder(ws).find((tile) => !isStream(tile));
  if (!ws.started) applyPreset(ws, ws.presetId, 1);
  const existing = free();
  if (existing) return existing;
  if (ws.presetId === 'custom') return splitLargest(ws);
  const n = streamCount(ws) + 1;
  const preset = presetById(ws.presetId);
  applyPreset(ws, preset.fixed ? 'equal' : ws.presetId, n);
  ws.minSlots = 0;
  return free();
}

/** Takes a stream off the grid. Layouts that fit themselves to the streams close up. */
export function removeTile(ws, id) {
  const tile = ws.tiles.find((candidate) => candidate.id === id);
  if (!tile) return ws;
  if (!tile.place) {
    ws.tiles = ws.tiles.filter((candidate) => candidate !== tile);
    return ws;
  }
  const preset = presetById(ws.presetId);
  tile.input = null;
  tile.label = undefined;
  tile.muted = true;
  tile.volume = 100;
  // Keep the id out of use so a stale player can never be matched to a new stream.
  tile.id = uid();
  const hidden = hiddenTiles(ws)[0];
  if (hidden) {
    hidden.place = tile.place;
    ws.tiles = ws.tiles.filter((candidate) => candidate !== tile);
  } else if (preset && !preset.fixed) {
    applyPreset(ws, ws.presetId, ws.minSlots);
  }
  return ws;
}

/** Brings a hidden stream onto the grid: into a free slot, or swapped with the last tile. */
export function showHidden(ws, id) {
  const hidden = ws.tiles.find((tile) => tile.id === id);
  if (!hidden || hidden.place) return null;
  const order = visualOrder(ws);
  const empty = order.find((tile) => !isStream(tile));
  if (empty) {
    hidden.place = empty.place;
    ws.tiles = ws.tiles.filter((tile) => tile !== empty);
    return null;
  }
  const last = order[order.length - 1];
  hidden.place = last.place;
  last.place = null;
  return last;
}

/**
 * The size the grid wants so preset tiles come out close to 16:9 with their control strip,
 * in the space available. Near-enough sizes just fill, so space isn't wasted on thin bars.
 */
export function fitStage(ws, width, height, stripHeight) {
  if (!ws.fit) return { width, height };
  const colUnits = sum(ws.cols);
  const rowUnits = sum(ws.rows);
  const strips = ws.rows.length * stripHeight;
  let fittedWidth = width;
  let fittedHeight = (width / colUnits) * (9 / 16) * rowUnits + strips;
  if (fittedHeight > height) {
    fittedHeight = height;
    fittedWidth = (((height - strips) * 16) / 9 / rowUnits) * colUnits;
  }
  return {
    width: fittedWidth / width > 0.88 ? width : Math.round(fittedWidth),
    height: fittedHeight / height > 0.88 ? height : Math.round(fittedHeight),
  };
}
