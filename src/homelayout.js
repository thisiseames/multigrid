// Home screen your way: the order of the home rows, which are shown, and what the banner cycles
// through. Saved in this browser. Matchday's row and banner aren't listed: they always lead.

const KEY = 'multigrid.homelayout.v1';

/** The IMDb and Rotten Tomatoes discovery rows, which start directly under Trending in Canada. */
const PICK_ROWS = [
  { id: 'imdb-moviemeter', title: 'IMDb MOVIEmeter' },
  { id: 'imdb-hidden-gems', title: 'IMDb Hidden Gems' },
  { id: 'imdb-most-popular', title: 'IMDb Most Popular TV' },
  { id: 'imdb-streaming', title: 'IMDb Popular on Streaming' },
  { id: 'rt-certified', title: 'RT Certified Fresh' },
  { id: 'rt-verified-hot', title: 'RT Verified Hot' },
  { id: 'rt-best-movies', title: 'RT Best Movies 2026' },
  { id: 'rt-best-tv', title: 'RT Best TV 2026' },
  { id: 'rt-popular-tv', title: 'RT Most Popular TV' },
];
export const PICK_ROW_IDS = PICK_ROWS.map((row) => row.id);

/** Every row the owner can move or hide, in the standard order. */
export const HOME_ROWS = [
  { id: 'continue', title: 'Continue watching' },
  { id: 'recent', title: 'Recent grids' },
  { id: 'teams', title: 'Your teams' },
  { id: 'fresh', title: 'New today' },
  { id: 'onnow', title: 'On now' },
  { id: 'ten', title: 'The Multigrid Ten' },
  { id: 'netflix', title: 'Top 10 on Netflix · Canada' },
  { id: 'trending', title: 'Trending in Canada' },
  ...PICK_ROWS,
  { id: 'trailers', title: 'Trending trailers' },
  { id: 'youtube', title: 'Trending on YouTube' },
];

/** The four home editions. Times are local; late wraps past midnight. */
export const DAYPARTS = [
  {
    id: 'morning', label: 'Morning edition', from: 5, to: 11,
    rows: ['continue', 'teams', 'fresh', 'onnow', 'ten', 'netflix', 'trending', ...PICK_ROW_IDS, 'trailers', 'youtube', 'recent'],
    hero: ['teamsLive', 'continue', 'fresh', 'teamsPost', 'onnow', 'ten', 'netflix', 'trending', ...PICK_ROW_IDS, 'youtube'],
  },
  {
    id: 'afternoon', label: 'Afternoon edition', from: 11, to: 17,
    rows: ['teams', 'onnow', 'continue', 'fresh', 'ten', 'netflix', 'trending', ...PICK_ROW_IDS, 'trailers', 'youtube', 'recent'],
    hero: ['teamsLive', 'onnow', 'continue', 'fresh', 'teamsPost', 'ten', 'netflix', 'trending', ...PICK_ROW_IDS, 'youtube'],
  },
  {
    id: 'prime', label: 'Prime time', from: 17, to: 23,
    rows: ['teams', 'onnow', 'ten', 'netflix', 'trending', ...PICK_ROW_IDS, 'trailers', 'youtube', 'fresh', 'continue', 'recent'],
    hero: ['teamsLive', 'onnow', 'ten', 'netflix', 'trending', ...PICK_ROW_IDS, 'youtube', 'fresh', 'continue', 'teamsPost'],
  },
  {
    id: 'late', label: 'After hours', from: 23, to: 5,
    rows: ['continue', 'ten', 'netflix', 'trending', ...PICK_ROW_IDS, 'trailers', 'youtube', 'fresh', 'onnow', 'teams', 'recent'],
    hero: ['continue', 'ten', 'netflix', 'trending', ...PICK_ROW_IDS, 'youtube', 'fresh', 'onnow', 'teamsLive', 'teamsPost'],
  },
];

/** The edition for a local date. Boundaries: 5, 11, 17, 23. */
export function daypartFor(date = new Date()) {
  const hour = date.getHours() + date.getMinutes() / 60;
  return DAYPARTS.find((part) => (part.from < part.to
    ? hour >= part.from && hour < part.to
    : hour >= part.from || hour < part.to)) ?? DAYPARTS[0];
}

/** The owner's visible rows, in the edition's order; rows it doesn't know stay at the end. */
export function daypartOrder(daypart, rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const first = (daypart?.rows ?? []).map((id) => byId.get(id)).filter(Boolean);
  const shown = new Set(first.map((row) => row.id));
  return [...first, ...rows.filter((row) => !shown.has(row.id))];
}

/** What the banner can show, and whether it does to begin with. Each goes with a row. */
export const BANNER_PARTS = [
  { id: 'teams', label: "Your teams' games", on: true },
  { id: 'continue', label: 'Continue watching', on: true },
  { id: 'fresh', label: 'New today', on: true },
  { id: 'onnow', label: 'On now', on: true },
  { id: 'ten', label: 'The Multigrid Ten', on: false },
  { id: 'netflix', label: 'Top 10 on Netflix', on: false },
  { id: 'trending', label: 'Trending in Canada', on: false },
  ...PICK_ROWS.map((row) => ({ id: row.id, label: row.title, on: false })),
  { id: 'youtube', label: 'Trending on YouTube', on: false },
];

/**
 * A saved layout made safe: every known row once, in the saved order, with rows it doesn't
 * know about (added later) at the bottom, switched on; unknown ids are dropped.
 */
export function homeLayout(saved) {
  const known = new Map(HOME_ROWS.map((row) => [row.id, row]));
  const order = (Array.isArray(saved?.order) ? saved.order : []).filter((id, at, list) => known.has(id) && list.indexOf(id) === at);
  for (const row of HOME_ROWS) {
    if (order.includes(row.id)) continue;
    // New discovery rows go directly under Trending, in their standard order.
    if (PICK_ROW_IDS.includes(row.id)) {
      const last = PICK_ROW_IDS.map((id) => order.indexOf(id)).filter((at) => at >= 0).pop();
      const after = last >= 0 ? last : order.indexOf('trending');
      if (after >= 0) order.splice(after + 1, 0, row.id);
      else order.push(row.id);
      continue;
    }
    if (row.id === 'youtube') {
      const after = order.indexOf('trailers');
      if (after >= 0) order.splice(after + 1, 0, row.id);
      else order.push(row.id);
      continue;
    }
    // The Multigrid Ten slots into the discovery group, after On now, in older saved layouts.
    const after = row.id === 'ten' ? order.indexOf('onnow') : -1;
    if (after >= 0) order.splice(after + 1, 0, row.id);
    else order.push(row.id);
  }
  const hidden = new Set(Array.isArray(saved?.hidden) ? saved.hidden : []);
  const banner = {};
  for (const part of BANNER_PARTS) banner[part.id] = typeof saved?.banner?.[part.id] === 'boolean' ? saved.banner[part.id] : part.on;
  return { rows: order.map((id) => ({ ...known.get(id), on: !hidden.has(id) })), banner };
}

/** The layout as it's saved. */
export const layoutData = (layout) => ({
  order: layout.rows.map((row) => row.id),
  hidden: layout.rows.filter((row) => !row.on).map((row) => row.id),
  banner: { ...layout.banner },
});

/** The layout with one row moved up (-1) or down (+1). */
export function moveRow(layout, id, step) {
  const rows = [...layout.rows];
  const at = rows.findIndex((row) => row.id === id);
  const to = at + step;
  if (at < 0 || to < 0 || to >= rows.length) return layout;
  [rows[at], rows[to]] = [rows[to], rows[at]];
  return { ...layout, rows };
}

/** The layout with a row shown or hidden. */
export const setRow = (layout, id, on) => ({ ...layout, rows: layout.rows.map((row) => (row.id === id ? { ...row, on } : row)) });

/**
 * Where the dynamic Matchday row sits among the normal rows.
 * It leads through the match and the two-hour full-time hold. After that it sits directly
 * below Trending in Canada; if that row is hidden, it goes to the bottom. At midnight the
 * phase is off and the caller omits the row entirely.
 */
export function homeRowOrder(ids, { matchday = false, phase = 'off', hold = false } = {}) {
  const order = Array.isArray(ids) ? [...ids] : [];
  if (!matchday) return order;
  if (!(phase === 'fulltime' && !hold)) return ['matchday', ...order];
  const at = order.indexOf('trending');
  order.splice(at >= 0 ? at + 1 : order.length, 0, 'matchday');
  return order;
}

/** The layout with a banner part on or off. */
export const setBanner = (layout, id, on) => ({ ...layout, banner: { ...layout.banner, [id]: on } });

/** Whether the banner shows a part: it's on, and its row isn't hidden. */
export const bannerShows = (layout, id) => Boolean(layout.banner[id]) && layout.rows.some((row) => row.id === id && row.on);

/** True when nothing differs from the standard layout. */
export const isStandard = (layout) => JSON.stringify(layoutData(layout)) === JSON.stringify(layoutData(homeLayout(null)));

export function loadHomeLayout() {
  try { return homeLayout(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return homeLayout(null); }
}

export function saveHomeLayout(layout) {
  try {
    if (isStandard(layout)) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(layoutData(layout)));
  } catch { /* private window: the change lasts until reload */ }
}
