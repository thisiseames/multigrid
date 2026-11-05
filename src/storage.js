// Workspace persistence: everything lives in this browser's localStorage. Only what the
// user pasted is saved, never a built player address, because Twitch's parent has to be
// worked out fresh on whichever domain the app is opened from.

import { emptyWorkspace, uid } from './layout.js';

const CURRENT_KEY = 'multigrid.current.v1';
const SAVED_KEY = 'multigrid.workspaces.v1';
const FAVORITES_KEY = 'multigrid.favorites.v1';

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const isTrackList = (list) => Array.isArray(list) && list.length > 0 && list.every((size) => Number.isFinite(size) && size > 0);

function validPlace(place, ws) {
  if (place === null) return true;
  if (!place) return false;
  const { c, r, cs, rs } = place;
  return [c, r, cs, rs].every(Number.isInteger) && c >= 0 && r >= 0 && cs >= 1 && rs >= 1
    && c + cs <= ws.cols.length && r + rs <= ws.rows.length;
}

/** Saved data could be from anywhere. Anything malformed gets treated as nothing saved. */
function sanitize(raw) {
  if (!raw || raw.v !== 1 || !isTrackList(raw.cols) || !isTrackList(raw.rows) || !Array.isArray(raw.tiles)) return null;
  const tiles = [];
  for (const tile of raw.tiles) {
    if (!tile || !validPlace(tile.place, raw)) return null;
    if (tile.input != null && typeof tile.input !== 'string') return null;
    tiles.push({
      id: uid(),
      input: tile.input || null,
      muted: tile.muted !== false,
      place: tile.place ? { ...tile.place } : null,
    });
  }
  return {
    v: 1,
    presetId: typeof raw.presetId === 'string' ? raw.presetId : 'custom',
    minSlots: Number.isInteger(raw.minSlots) ? raw.minSlots : 0,
    started: Boolean(raw.started),
    fit: Boolean(raw.fit),
    cols: [...raw.cols],
    rows: [...raw.rows],
    tiles,
  };
}

function snapshot(ws) {
  return {
    v: 1,
    presetId: ws.presetId,
    minSlots: ws.minSlots,
    started: ws.started,
    fit: ws.fit,
    cols: ws.cols,
    rows: ws.rows,
    tiles: ws.tiles.map(({ input, muted, place }) => ({ input, muted, place })),
  };
}

/* Favorites hold what was pasted plus a name, newest first. */

export function listFavorites() {
  const list = read(FAVORITES_KEY);
  return Array.isArray(list) ? list.filter((item) => item && typeof item.input === 'string' && typeof item.name === 'string') : [];
}

export const favoriteName = (input) => listFavorites().find((item) => item.input === input)?.name ?? null;

export const isFavorite = (input) => favoriteName(input) !== null;

export function addFavorite(input, name) {
  return write(FAVORITES_KEY, [{ input, name }, ...listFavorites().filter((item) => item.input !== input)]);
}

export function removeFavorite(input) {
  return write(FAVORITES_KEY, listFavorites().filter((item) => item.input !== input));
}

export function renameFavorite(input, name) {
  return write(FAVORITES_KEY, listFavorites().map((item) => (item.input === input ? { input, name } : item)));
}

export const loadCurrent = () => sanitize(read(CURRENT_KEY)) || emptyWorkspace();
export const saveCurrent = (ws) => write(CURRENT_KEY, snapshot(ws));

export function listSaved() {
  const list = read(SAVED_KEY);
  return Array.isArray(list) ? list.filter((item) => item && typeof item.name === 'string' && item.workspace) : [];
}

export const findSaved = (name) => listSaved().find((item) => item.name === name);

/** Saves under a name, replacing a layout that already has it. */
export function saveNamed(name, ws) {
  const list = listSaved().filter((item) => item.name !== name);
  list.unshift({ name, savedAt: Date.now(), workspace: snapshot(ws) });
  return write(SAVED_KEY, list);
}

export function renameSaved(from, to) {
  const list = listSaved().filter((item) => item.name !== to);
  const item = list.find((candidate) => candidate.name === from);
  if (!item) return false;
  item.name = to;
  return write(SAVED_KEY, list);
}

export function deleteSaved(name) {
  return write(SAVED_KEY, listSaved().filter((item) => item.name !== name));
}

/** Puts back a deleted layout, for Undo. */
export function restoreSavedItem(item) {
  return write(SAVED_KEY, [item, ...listSaved().filter((other) => other.name !== item.name)]);
}

export const openSaved = (item) => sanitize(item.workspace);
