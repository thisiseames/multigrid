// Layout engine: pure data, no DOM.
//
// A layout is a CSS Grid described by data. `cols` and `rows` are track sizes (fr units),
// and each tile has a `place` of { c, r, cs, rs }: its first column, first row, and how
// many tracks it spans. Presets just generate that data, so nothing downstream knows
// about templates. A tile with `place: null` is hidden; a tile with `input: null` is an
// empty slot.

import { parseSource } from './sources.js';

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
 * A grid of the other streams, with the phone in its own tall column on the right.
 * Rows grow downwards and the first row holds any remainder, so three streams read as
 * one across the top and two underneath, and no cell is ever left blank.
 */
function phoneGrid(n) {
  const others = Math.max(n - 1, 0);
  if (others === 0) return { cols: [1], rows: [1], slots: [{ c: 0, r: 0, cs: 1, rs: 1 }] };
  // Horizontal video reads better in wide cells: one column until there are three
  // streams, then two columns. Three streams become one across and two underneath.
  const gridCols = others <= 2 ? 1 : 2;
  const gridRows = Math.ceil(others / gridCols);
  const firstRow = others - gridCols * (gridRows - 1);
  const slots = [];
  let index = 0;
  for (let row = 0; row < gridRows; row++) {
    const count = row === 0 ? firstRow : Math.min(gridCols, others - index);
    // Share the row's columns evenly, giving any remainder to the earliest tiles.
    const base = Math.floor(gridCols / count);
    const extra = gridCols % count;
    let c = 0;
    for (let i = 0; i < count; i++) {
      const span = base + (i < extra ? 1 : 0);
      slots.push({ c, r: row, cs: span, rs: 1 });
      c += span;
      index++;
    }
  }
  // The phone gets its own column after the video tracks. It is made `auto` wide
  // whenever a feed is actually playing, so its 9:16 shape sets the width.
  slots.push({ c: gridCols, r: 0, cs: 1, rs: gridRows });
  return { cols: units(gridCols + 1), rows: units(gridRows), slots };
}

/** One big stream across the top, the rest and the phone in a row underneath. */
function phoneBottomGrid(n) {
  const below = Math.max(n - 2, 0);
  const gridCols = Math.max(below, 1);
  const slots = [{ c: 0, r: 0, cs: gridCols + 1, rs: 1 }];
  for (let i = 0; i < below; i++) slots.push({ c: i, r: 1, cs: 1, rs: 1 });
  // With no second stream the bottom row still needs a slot beside the phone.
  if (!below) slots.push({ c: 0, r: 1, cs: 1, rs: 1 });
  slots.push({ c: gridCols, r: 1, cs: 1, rs: 1 });
  return { cols: units(gridCols + 1), rows: [2, 1], slots };
}

/** Layouts where a TikTok feed becomes a real phone-shaped column. */
export const isPhoneLayout = (ws) => ws.presetId === 'phone' || ws.presetId === 'phoneBottom' || ws.presetId === 'phoneSide';

/** The slot a phone layout keeps for the vertical feed. */
const phoneSlotIndex = (presetId, slots) => (presetId === 'phoneSide' ? 1 : slots.length - 1);

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
  { id: 'phone', name: 'Grid and phone', hint: 'A tall phone on the right, the rest beside it', sample: 5, build: phoneGrid },
  { id: 'phoneBottom', name: 'Feature and phone', hint: 'One big stream on top, the phone below', sample: 5, build: phoneBottomGrid },
  { id: 'phoneSide', name: 'Big screen and phone', hint: 'One big stream, phone above a second screen', fixed: 3, build: () => ({
    cols: units(2),
    rows: [2, 1],
    slots: [{ c: 0, r: 0, cs: 1, rs: 2 }, { c: 1, r: 0, cs: 1, rs: 1 }, { c: 1, r: 1, cs: 1, rs: 1 }],
  }) },
  // Like a TV: the main stream fills the screen and the second sits small in the bottom-right corner.
  // Both share one cell; the grid draws the second one small (see grid-view.js).
  { id: 'pip', name: 'Picture in picture', hint: 'A small screen in the corner of the big one', fixed: 2,
    build: () => ({ cols: [1], rows: [1], slots: [{ c: 0, r: 0, cs: 1, rs: 1 }, { c: 0, r: 0, cs: 1, rs: 1 }] }),
    diagram: { cols: [3, 1], rows: [3, 1], slots: [{ c: 0, r: 0, cs: 2, rs: 2 }, { c: 1, r: 1, cs: 1, rs: 1 }] } },
  // The same, with two small screens stacked in the bottom-right corner, one above the other.
  { id: 'pip2', name: 'Picture in picture ×2', hint: 'Two small screens in the corner of the big one', fixed: 3,
    build: () => ({ cols: [1], rows: [1], slots: [0, 1, 2].map(() => ({ c: 0, r: 0, cs: 1, rs: 1 })) }),
    diagram: { cols: [3, 1], rows: [2, 1, 1], slots: [{ c: 0, r: 0, cs: 2, rs: 3 }, { c: 1, r: 2, cs: 1, rs: 1 }, { c: 1, r: 1, cs: 1, rs: 1 }] } },
  { id: 'grid2', name: '2 × 2', fixed: 4, build: () => cells(2, 2) },
  { id: 'grid3x2', name: '3 × 2', fixed: 6, build: () => cells(3, 2) },
  { id: 'grid2x3', name: '2 × 3', fixed: 6, build: () => cells(2, 3) },
  { id: 'grid3', name: '3 × 3', fixed: 9, build: () => cells(3, 3) },
  { id: 'grid4', name: '4 × 4', fixed: 16, build: () => cells(4, 4) },
  { id: 'featured', name: 'Featured', hint: 'One big, the rest small', sample: 6, build: featured },
  { id: 'focus', name: 'Focus and row', sample: 4, build: focusRow },
  { id: 'trio', name: 'One and two', fixed: 3, build: () => ({
    cols: [2, 1],
    rows: units(2),
    slots: [{ c: 0, r: 0, cs: 1, rs: 2 }, { c: 1, r: 0, cs: 1, rs: 1 }, { c: 1, r: 1, cs: 1, rs: 1 }],
  }) },
  { id: 'overtwo', name: 'One over two', fixed: 3, build: () => ({
    cols: units(2),
    rows: [2, 1],
    slots: [{ c: 0, r: 0, cs: 2, rs: 1 }, { c: 0, r: 1, cs: 1, rs: 1 }, { c: 1, r: 1, cs: 1, rs: 1 }],
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
  return preset.diagram ?? preset.build(preset.fixed ?? preset.sample ?? 1);
}

export const isStream = (tile) => Boolean(tile.input);
export const isVisible = (tile) => Boolean(tile.place);
export const streamCount = (ws) => ws.tiles.filter(isStream).length;
export const hiddenTiles = (ws) => ws.tiles.filter((tile) => isStream(tile) && !isVisible(tile));
/** Picture in picture, with one small screen or two. */
export const isPipPreset = (id) => id === 'pip' || id === 'pip2';
export const primaryTile = (ws) => ws.tiles.find((tile) => tile.primary && isStream(tile)) ?? null;

/** How much of the stage a place covers, as a share of each axis multiplied together. */
function placeArea(place, cols, rows) {
  const part = (tracks, start, span) => sum(tracks.slice(start, start + span)) / sum(tracks);
  return part(cols, place.c, place.cs) * part(rows, place.r, place.rs);
}

/** The index of the biggest place; ties go to the one nearest the top-left. */
function biggestIndex(places, cols, rows) {
  let best = -1;
  places.forEach((place, index) => {
    if (!place) return;
    if (best < 0) { best = index; return; }
    const a = placeArea(place, cols, rows);
    const b = placeArea(places[best], cols, rows);
    const earlier = place.r < places[best].r || (place.r === places[best].r && place.c < places[best].c);
    if (a > b + 1e-9 || (Math.abs(a - b) <= 1e-9 && earlier)) best = index;
  });
  return best;
}

const byPosition = (a, b) => a.place.r - b.place.r || a.place.c - b.place.c;

/** Every tile on the grid in reading order, empty slots included. */
export const visualOrder = (ws) => ws.tiles.filter(isVisible).sort(byPosition);

const orderedStreams = (ws) => [...visualOrder(ws).filter(isStream), ...hiddenTiles(ws)];

/** A stream that is a TikTok account, which plays as a vertical feed. */
const isTikTokFeed = (tile) => {
  if (!tile?.input) return false;
  const source = parseSource(tile.input);
  return source.kind === 'tiktok' && Boolean(source.tiktok?.profile);
};

/** The stream that belongs in the phone column, worked out fresh from its link. */
export function phoneTile(ws) {
  if (!isPhoneLayout(ws)) return null;
  return visualOrder(ws).find((tile) => isStream(tile) && isTikTokFeed(tile)) ?? null;
}

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
  // The primary stream always takes the biggest spot; the rest keep their order around it.
  const primary = streams.find((tile) => tile.primary);
  if (primary && slots.length) {
    streams.splice(streams.indexOf(primary), 1);
    // A phone column belongs to the feed, so the primary takes the biggest other slot.
    const phoneAt = isPhoneLayout({ presetId: preset.id }) ? phoneSlotIndex(preset.id, slots) : -1;
    let best = 0;
    let bestArea = -1;
    slots.forEach((place, index) => {
      if (index === phoneAt) return;
      const area = placeArea(place, cols, rows);
      if (area > bestArea) {
        bestArea = area;
        best = index;
      }
    });
    streams.splice(Math.min(best, streams.length), 0, primary);
  }
  ws.tiles = slots.map((place, index) => (
    index < streams.length ? Object.assign(streams[index], { place: { ...place } }) : emptyTile({ ...place })
  ));
  for (const extra of streams.slice(slots.length)) {
    extra.place = null;
    ws.tiles.push(extra);
  }
  // A phone layout keeps one slot for the vertical feed, wherever that slot sits.
  if (isPhoneLayout({ presetId: preset.id })) {
    const feed = ws.tiles.find((tile) => isStream(tile) && isTikTokFeed(tile));
    const occupant = ws.tiles[phoneSlotIndex(preset.id, slots)];
    if (feed && occupant && occupant !== feed) {
      [feed.place, occupant.place] = [occupant.place, feed.place];
    }
  }
  return ws;
}

/**
 * Packs a phone layout again after streams are added or removed, so the grid keeps
 * filling every cell instead of leaving a hole where a tile used to be.
 */
export function reflowPhone(ws) {
  if (!isPhoneLayout(ws)) return ws;
  const phone = phoneTile(ws);
  // With no vertical feed left, the phone layout has nothing to size its column, so it
  // becomes an even grid rather than leaving two tiles stacked in one spot.
  if (!phone) return applyPreset(ws, 'equal', 0);
  const streams = visualOrder(ws).filter((tile) => isStream(tile) && tile !== phone);
  if (ws.presetId === 'phoneSide') {
    // The feed belongs in the top-right cell; anything else there swaps with it.
    const occupant = ws.tiles.find((tile) => tile !== phone && tile.place
      && tile.place.c === 1 && tile.place.r === 0 && tile.place.cs === 1 && tile.place.rs === 1);
    if (occupant) [phone.place, occupant.place] = [occupant.place, phone.place];
    else phone.place = { c: 1, r: 0, cs: 1, rs: 1 };
    return ws;
  }
  if (ws.presetId === 'phone') {
    const { cols, rows, slots } = phoneGrid(streams.length + 1);
    ws.cols = [...cols];
    ws.rows = [...rows];
    streams.forEach((tile, index) => { tile.place = { ...slots[index] }; });
    phone.place = { ...slots[slots.length - 1] };
    return ws;
  }
  // Feature and phone: the biggest stream keeps the top row, the rest share the bottom.
  const primary = streams.find((tile) => tile.primary) ?? streams[0] ?? null;
  const below = streams.filter((tile) => tile !== primary);
  const { cols, rows, slots } = phoneBottomGrid(streams.length + 1);
  ws.cols = [...cols];
  ws.rows = [...rows];
  if (primary) primary.place = { ...slots[0] };
  below.forEach((tile, index) => { tile.place = { ...slots[index + 1] }; });
  phone.place = { ...slots[slots.length - 1] };
  return ws;
}

/** Puts one stream in a full-height phone column and lays the rest out beside it. */
export function phoneColumn(ws, phoneId) {
  const phone = ws.tiles.find((tile) => tile.id === phoneId);
  if (!phone) return ws;
  const streams = orderedStreams(ws).filter((tile) => tile !== phone);
  const { cols, rows, slots } = phoneGrid(streams.length + 1);
  ws.presetId = 'phone';
  ws.fit = false;
  ws.started = true;
  ws.cols = [...cols];
  ws.rows = [...rows];
  phone.place = { ...slots[slots.length - 1] };
  streams.forEach((tile, index) => { tile.place = { ...slots[index] }; });
  for (const tile of ws.tiles) {
    if (tile !== phone && !streams.includes(tile)) tile.place = null;
  }
  return ws;
}

/**
 * Makes a stream the primary one (or stops it being primary). A new primary moves straight
 * into the biggest spot on screen, swapping with whatever was there.
 */
export function setPrimary(ws, id, on = true) {
  const tile = ws.tiles.find((candidate) => candidate.id === id);
  if (!tile || !isStream(tile)) return ws;
  for (const other of ws.tiles) other.primary = false;
  if (!on) return ws;
  tile.primary = true;
  const shown = ws.tiles.filter(isVisible);
  const big = shown[biggestIndex(shown.map((t) => t.place), ws.cols, ws.rows)];
  if (!big || big === tile) return ws;
  if (tile.place) {
    [tile.place, big.place] = [big.place, tile.place];
  } else {
    tile.place = big.place;
    if (isStream(big)) big.place = null;
    else ws.tiles = ws.tiles.filter((candidate) => candidate !== big);
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
  ws.previous = null;
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
  // A full fixed layout has to grow into Equal. Remember it, so closing a stream can go back.
  if (preset.fixed && !ws.previous) {
    ws.previous = {
      presetId: ws.presetId,
      minSlots: ws.minSlots,
      places: ws.tiles.filter((tile) => isStream(tile) && tile.place).map((tile) => ({ input: tile.input, place: { ...tile.place } })),
    };
  }
  applyPreset(ws, preset.fixed ? 'equal' : ws.presetId, n);
  ws.minSlots = 0;
  return free();
}

/**
 * The same streams with no empty boxes, for saving a layout: 2 streams saved in a 5-box layout
 * become 2 side by side, not 2 and three empty boxes. A layout the streams fill is kept as it is.
 * Returns a copy; the screen itself isn't changed.
 */
export function fitToStreams(source) {
  const ws = JSON.parse(JSON.stringify(source));
  const streams = ws.tiles.filter(isStream);
  if (!streams.length || !ws.tiles.some((tile) => tile.place && !tile.input)) return ws;
  ws.tiles = streams;
  const preset = ws.presetId === 'custom' ? null : presetById(ws.presetId);
  return applyPreset(ws, !preset || preset.fixed ? 'equal' : ws.presetId, 0);
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
  tile.primary = false;
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
  restorePrevious(ws);
  return ws;
}

const samePlace = (a, b) => a && b && a.c === b.c && a.r === b.r && a.cs === b.cs && a.rs === b.rs;

/**
 * Goes back to the layout that had to grow when a stream was added, once the streams fit it
 * again. Each stream returns to its old spot; any newcomer takes whatever spot is free.
 */
export function restorePrevious(ws) {
  const previous = ws.previous;
  const preset = previous && presetById(previous.presetId);
  if (!preset) { ws.previous = null; return false; }
  if (streamCount(ws) > (preset.fixed ?? Infinity)) return false;
  ws.previous = null;
  applyPreset(ws, preset.id, previous.minSlots || 0);
  const placed = new Set();
  for (const { input, place } of previous.places ?? []) {
    const tile = ws.tiles.find((candidate) => candidate.input === input && candidate.place && !placed.has(candidate));
    const holder = ws.tiles.find((candidate) => samePlace(candidate.place, place));
    if (!tile || !holder) continue;
    [tile.place, holder.place] = [holder.place, tile.place];
    placed.add(tile);
  }
  const primary = primaryTile(ws);
  if (primary) setPrimary(ws, primary.id, true);
  return true;
}

/** Choosing a layout yourself means there's nothing to go back to. */
export const forgetPrevious = (ws) => { ws.previous = null; };

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
  // The primary stream keeps its spot.
  const last = [...order].reverse().find((tile) => !tile.primary) ?? order[order.length - 1];
  hidden.place = last.place;
  last.place = null;
  return last;
}

/**
 * The size the grid wants so preset tiles come out close to 16:9 with their control strip,
 * in the space available. Near-enough sizes just fill, so space isn't wasted on thin bars.
 */
export function fitStage(ws, width, height, stripHeight, cinema = null) {
  if (!ws.fit) return { width, height };
  if (cinema) return fitCinema(ws, width, height, stripHeight, cinema);
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

/**
 * The big spot shaped like a film. Only when it spans the full width: then its rows are made as
 * tall as the film needs, and every other row keeps the normal TV shape. Returns the stage size
 * and the row sizes to draw with.
 */
function fitCinema(ws, width, height, stripHeight, { tile, shape }) {
  const colUnits = sum(ws.cols);
  const { r, rs } = tile.place;
  const bigUnits = sum(ws.rows.slice(r, r + rs));
  // Each row's picture height for a stage 1px wide.
  const perWidth = ws.rows.map((units, index) => (index >= r && index < r + rs
    ? (1 / shape) * (units / bigUnits)
    : (1 / colUnits) * (9 / 16) * units));
  const strips = ws.rows.length * stripHeight;
  const k = sum(perWidth);
  let w = width;
  if (w * k + strips > height) w = (height - strips) / k;
  const rows = perWidth.map((part) => part * w + stripHeight);
  const fittedHeight = sum(rows);
  return {
    width: w / width > 0.97 ? width : Math.round(w),
    height: fittedHeight / height > 0.97 ? height : Math.round(fittedHeight),
    rows,
  };
}

/** The tile that gets the film shape: the biggest one, if it spans the full width. */
export function cinemaSpot(ws, hasCinema) {
  if (!ws.fit || ws.presetId === 'custom') return null;
  const shown = ws.tiles.filter((tile) => isStream(tile) && tile.place);
  if (!shown.length) return null;
  const big = shown[biggestIndex(shown.map((tile) => tile.place), ws.cols, ws.rows)];
  if (!big || big.place.cs !== ws.cols.length) return null;
  // Only when it really is the big spot, not one row of equal tiles.
  const others = shown.filter((tile) => tile !== big);
  if (others.some((tile) => placeArea(tile.place, ws.cols, ws.rows) >= placeArea(big.place, ws.cols, ws.rows) - 1e-9)) return null;
  const shape = hasCinema(big);
  return shape ? { tile: big, shape } : null;
}
