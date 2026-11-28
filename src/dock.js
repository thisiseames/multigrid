// The Dock: the favorites one drag from the grid (laptop). Which ones it holds and in what order,
// worked out here without the page so it can be tested; the page draws it and handles the drag.
//   1. pinned favorites, in pin order
//   2. manually added tiles, in add order
//   3. the favorites opened most in the last 30 days
//   4. then recent streams (Recently watched, Continue watching) while there's room
//   5. then the rest of the favorites, in their own order, so the dock is always full
// Stored as multigrid.dock.v1 = { pins: [input…], added: [{ input, name }…], hidden: [input…], opens: { input: [time…] } }.

export const DOCK_SIZE = 12;
const MONTH = 30 * 24 * 3600 * 1000;
const KEY = 'multigrid.dock.v1';

const cleanName = (name, input) => (typeof name === 'string' && name.trim() ? name.trim().slice(0, 300) : input);

/** A stored dock made safe. */
export function dockData(saved) {
  const pins = Array.isArray(saved?.pins) ? saved.pins.filter((input, at, list) => typeof input === 'string' && input && list.indexOf(input) === at) : [];
  const opens = {};
  for (const [input, times] of Object.entries(saved?.opens ?? {})) {
    const kept = Array.isArray(times) ? times.filter((time) => Number.isFinite(time)) : [];
    if (input && kept.length) opens[input] = kept;
  }
  const added = [];
  if (Array.isArray(saved?.added)) {
    for (const entry of saved.added) {
      const input = typeof entry === 'string' ? entry : entry?.input;
      if (typeof input !== 'string' || !input || input.startsWith('local:')) continue;
      if (added.some((item) => item.input === input)) continue;
      added.push({ input, name: cleanName(typeof entry === 'string' ? '' : entry?.name, input) });
      if (added.length >= DOCK_SIZE) break;
    }
  }
  const hidden = Array.isArray(saved?.hidden)
    ? saved.hidden.filter((input, at, list) => typeof input === 'string' && input && list.indexOf(input) === at)
    : [];
  return { pins, opens, added, hidden };
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

export const pin = (data, input) => (data.pins.includes(input) ? data : {
  ...data,
  pins: [...data.pins, input],
  hidden: (data.hidden ?? []).filter((item) => item !== input),
});
export const unpin = (data, input) => ({ ...data, pins: data.pins.filter((item) => item !== input) });
export const isPinned = (data, input) => data.pins.includes(input);
export const isAdded = (data, input) => (data.added ?? []).some((item) => item.input === input);

/** Inputs that already reserve one of the 12 slots: pins and manual additions, once each. */
export const reservedInputs = (data) => new Set([
  ...(data.pins ?? []),
  ...(data.added ?? []).map((item) => item.input),
]);

/** Slots not reserved by a pin or a manual addition. Automatic picks can still fill them. */
export const freeDockSlots = (data, size = DOCK_SIZE) => Math.max(0, size - reservedInputs(data).size);

/** True when a new pin can be added, or the item already reserves a slot as a manual addition. */
export const canPinToDock = (data, input) => isPinned(data, input) || isAdded(data, input) || freeDockSlots(data) > 0;

/** Adds a tile to the unpinned part of the dock. Returns the data unchanged when full. */
export function addToDock(data, input, name) {
  if (typeof input !== 'string' || !input || input.startsWith('local:')) return data;
  if (isPinned(data, input) || isAdded(data, input) || !freeDockSlots(data)) return data;
  return {
    ...data,
    added: [...(data.added ?? []), { input, name: cleanName(name, input) }],
    hidden: (data.hidden ?? []).filter((item) => item !== input),
  };
}

/** Removes a tile from the dock and keeps the automatic picks from bringing it back. */
export function removeFromDock(data, input) {
  return {
    ...data,
    pins: (data.pins ?? []).filter((item) => item !== input),
    added: (data.added ?? []).filter((item) => item.input !== input),
    hidden: [...new Set([...(data.hidden ?? []), input])].filter(Boolean),
  };
}

/** Moves a pin one place left or right. */
export function movePin(data, input, delta) {
  const pins = data.pins ?? [];
  const index = pins.indexOf(input);
  const to = index + delta;
  if (index < 0 || !Number.isInteger(delta) || delta === 0 || to < 0 || to >= pins.length) return data;
  const next = [...pins];
  [next[index], next[to]] = [next[to], next[index]];
  return { ...data, pins: next };
}

/** Moves a pin before or after another pin, for a drag onto its dock slot. */
export function reorderPin(data, input, target, after = false) {
  const pins = data.pins ?? [];
  if (input === target || !pins.includes(input)) return data;
  const rest = pins.filter((item) => item !== input);
  let at = rest.indexOf(target);
  if (at < 0) return data;
  if (after) at += 1;
  rest.splice(at, 0, input);
  return { ...data, pins: rest };
}

/**
 * The dock's items, in order. `favorites` are the saved favorites ({ input, name, … }),
 * `recent` the recently opened streams' inputs, newest first. Manual additions may be
 * streams that are not favorites. Only pinned, added or favorite inputs appear.
 */
export function dockItems(data, favorites, recent = [], now = Date.now(), size = DOCK_SIZE) {
  const byInput = new Map((favorites ?? []).filter((item) => item?.input).map((item) => [item.input, item]));
  const manual = new Map((data.added ?? []).filter((item) => item?.input).map((item) => [item.input, item]));
  const hidden = new Set(data.hidden ?? []);
  const picked = [];
  const add = (input) => {
    if (picked.length >= size) return;
    const item = byInput.get(input) ?? manual.get(input);
    const pinned = (data.pins ?? []).includes(input);
    if (!item || picked.some((candidate) => candidate.input === input)) return;
    if (hidden.has(input) && !pinned && !manual.has(input)) return;
    picked.push({
      ...item,
      pinned,
      ...(manual.has(input) ? { added: true } : {}),
    });
  };
  for (const input of data.pins ?? []) add(input);
  for (const item of data.added ?? []) add(item.input);
  const counts = Object.entries(data.opens)
    .map(([input, times]) => [input, times.filter((time) => now - time < MONTH).length])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  for (const [input] of counts) add(input);
  for (const input of recent) add(input);
  for (const item of favorites ?? []) add(item?.input);
  return picked;
}

export function loadDock() {
  try { return dockData(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return dockData(null); }
}

export function saveDock(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* not remembered */ }
}
