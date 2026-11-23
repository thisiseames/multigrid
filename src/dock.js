// The Dock: the favorites one drag from the grid (laptop). Which ones it holds and in what order,
// worked out here without the page so it can be tested; the page draws it and handles the drag.
//   1. pinned favorites, in pin order
//   2. the favorites opened most in the last 30 days
//   3. then recent streams (Recently watched, Continue watching) while there's room
// Stored as multigrid.dock.v1 = { pins: [input…], opens: { input: [time…] } }.

export const DOCK_SIZE = 12;
const MONTH = 30 * 24 * 3600 * 1000;
const KEY = 'multigrid.dock.v1';

/** A stored dock made safe. */
export function dockData(saved) {
  const pins = Array.isArray(saved?.pins) ? saved.pins.filter((input, at, list) => typeof input === 'string' && input && list.indexOf(input) === at) : [];
  const opens = {};
  for (const [input, times] of Object.entries(saved?.opens ?? {})) {
    const kept = Array.isArray(times) ? times.filter((time) => Number.isFinite(time)) : [];
    if (input && kept.length) opens[input] = kept;
  }
  return { pins, opens };
}

/** The dock with one more open of a stream; opens older than 30 days are dropped. */
export function noteOpen(data, input, now = Date.now()) {
  const opens = {};
  for (const [key, times] of Object.entries(data.opens)) {
    const kept = times.filter((time) => now - time < MONTH);
    if (kept.length) opens[key] = kept;
  }
  if (input) opens[input] = [...(opens[input] ?? []), now].slice(-200);
  return { ...data, opens };
}

export const pin = (data, input) => (data.pins.includes(input) ? data : { ...data, pins: [...data.pins, input] });
export const unpin = (data, input) => ({ ...data, pins: data.pins.filter((item) => item !== input) });
export const isPinned = (data, input) => data.pins.includes(input);

/**
 * The dock's favorites, in order. `favorites` are the saved favorites ({ input, name, … }),
 * `recent` the recently opened streams' inputs, newest first. Only saved favorites appear.
 */
export function dockItems(data, favorites, recent = [], now = Date.now(), size = DOCK_SIZE) {
  const byInput = new Map((favorites ?? []).filter((item) => item?.input).map((item) => [item.input, item]));
  const picked = [];
  const add = (input) => {
    if (picked.length >= size || !byInput.has(input) || picked.some((item) => item.input === input)) return;
    picked.push({ ...byInput.get(input), pinned: data.pins.includes(input) });
  };
  for (const input of data.pins) add(input);
  const counts = Object.entries(data.opens)
    .map(([input, times]) => [input, times.filter((time) => now - time < MONTH).length])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  for (const [input] of counts) add(input);
  for (const input of recent) add(input);
  return picked;
}

export function loadDock() {
  try { return dockData(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return dockData(null); }
}

export function saveDock(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* not remembered */ }
}
