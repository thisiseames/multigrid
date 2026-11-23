// Home screen your way: the order of the home rows, which are shown, and what the banner cycles
// through. Saved in this browser. Matchday's row and banner aren't listed: they always lead.

const KEY = 'multigrid.homelayout.v1';

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
];

/** What the banner can show, and whether it does to begin with. Each goes with a row. */
export const BANNER_PARTS = [
  { id: 'teams', label: "Your teams' games", on: true },
  { id: 'continue', label: 'Continue watching', on: true },
  { id: 'fresh', label: 'New today', on: true },
  { id: 'onnow', label: 'On now', on: true },
  { id: 'ten', label: 'The Multigrid Ten', on: false },
  { id: 'netflix', label: 'Top 10 on Netflix', on: false },
  { id: 'trending', label: 'Trending in Canada', on: false },
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
