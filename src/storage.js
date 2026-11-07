// Workspace persistence: everything lives in this browser's localStorage. Only what the
// user pasted is saved, never a built player address, because Twitch's parent has to be
// worked out fresh on whichever domain the app is opened from.

import { emptyWorkspace, uid } from './layout.js';

const CURRENT_KEY = 'multigrid.current.v1';
const SAVED_KEY = 'multigrid.workspaces.v1';
const FAVORITES_KEY = 'multigrid.favorites.v1';
const CLOSED_FOLDERS_KEY = 'multigrid.favorites.closed.v1';
const MIXER_KEY = 'multigrid.mixer.v1';

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
      volume: Number.isFinite(tile.volume) ? Math.min(100, Math.max(0, Math.round(tile.volume))) : 100,
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
    tiles: ws.tiles.map(({ input, muted, volume, place }) => ({ input, muted, volume, place })),
  };
}

/* The mixer row starts open, and stays however it was left. */

export const isMixerOpen = () => read(MIXER_KEY) !== false;
export const setMixerOpen = (open) => write(MIXER_KEY, open);

/* Favorites hold what was pasted, a name and an optional folder, newest first. */

const sameFolder = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
const cleanFolder = (folder) => (typeof folder === 'string' ? folder.trim() : '');

export function listFavorites() {
  const list = read(FAVORITES_KEY);
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item.input === 'string' && typeof item.name === 'string')
    .map(({ input, name, group }) => ({ input, name, group: cleanFolder(group) }));
}

export const favoriteName = (input) => listFavorites().find((item) => item.input === input)?.name ?? null;

/** Every folder in use, A to Z. A folder exists only while a favorite is in it. */
export function listFolders() {
  const folders = [];
  for (const { group } of listFavorites()) {
    if (group && !folders.some((folder) => sameFolder(folder, group))) folders.push(group);
  }
  return folders.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** Adds a favorite, or changes one in place. "news" joins a folder already called "News". */
export function saveFavorite(input, name, folder = '') {
  const typed = cleanFolder(folder);
  const group = listFolders().find((existing) => sameFolder(existing, typed)) ?? typed;
  const list = listFavorites();
  const item = { input, name, group };
  const at = list.findIndex((other) => other.input === input);
  if (at === -1) list.unshift(item);
  else list[at] = item;
  const saved = write(FAVORITES_KEY, list);
  // Otherwise it would land out of sight in a closed folder.
  if (saved && group) setFolderClosed(group, false);
  return saved;
}

export function removeFavorite(input) {
  return write(FAVORITES_KEY, listFavorites().filter((item) => item.input !== input));
}

/** Renaming onto another folder's name puts the two together. */
export function renameFolder(from, to) {
  const typed = cleanFolder(to);
  if (!typed) return false;
  const existing = listFolders().find((folder) => sameFolder(folder, typed) && !sameFolder(folder, from));
  const group = existing ?? typed;
  const wasClosed = isFolderClosed(from);
  const saved = write(FAVORITES_KEY, listFavorites().map((item) => (
    item.group && sameFolder(item.group, from) ? { ...item, group } : item
  )));
  if (saved) {
    setFolderClosed(from, false);
    setFolderClosed(group, Boolean(wasClosed && !existing));
  }
  return saved;
}

/* Moving favorites to another device: they travel squeezed into the part of a link after
   the #, which browsers never send to the website. Files from this computer stay behind,
   because the other device can't open them. */

export const TRANSFER_PREFIX = '#fav1=';
const MAX_TRANSFER = 500;

const toBase64Url = (bytes) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (code) => {
  const text = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
};

const squeeze = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

/** The favorites that can travel, and how many files had to stay. */
export function transferableFavorites() {
  const all = listFavorites();
  const items = all.filter((item) => !item.input.startsWith('local:'));
  return { items, left: all.length - items.length };
}

export async function packFavorites(items) {
  const json = JSON.stringify(items.map(({ input, name, group }) => (group ? [input, name, group] : [input, name])));
  return toBase64Url(await squeeze(new TextEncoder().encode(json), new CompressionStream('deflate-raw')));
}

/** Anything that isn't a list of favorites gives null. A link could come from anywhere. */
export async function unpackFavorites(code) {
  try {
    const json = new TextDecoder().decode(await squeeze(fromBase64Url(code), new DecompressionStream('deflate-raw')));
    const list = JSON.parse(json);
    if (!Array.isArray(list) || list.length === 0 || list.length > MAX_TRANSFER) return null;
    const items = [];
    for (const entry of list) {
      if (!Array.isArray(entry) || entry.length < 2 || entry.length > 3 || !entry.every((part) => typeof part === 'string')) return null;
      const [input, name, group = ''] = entry;
      if (!input.trim() || !name.trim() || input.length > 4000 || name.length > 200 || group.length > 40) return null;
      if (input.startsWith('local:')) continue;
      items.push({ input, name: name.trim(), group: cleanFolder(group) });
    }
    return items.length ? items : null;
  } catch {
    return null;
  }
}

/** The ones this device doesn't have yet. A stream already saved here keeps its name here. */
export function newFavorites(items) {
  const have = new Set(listFavorites().map((item) => item.input));
  const seen = new Set();
  return items.filter((item) => {
    if (have.has(item.input) || seen.has(item.input)) return false;
    seen.add(item.input);
    return true;
  });
}

/** Adds them in one save. A folder joins one already here with the same name, any capitals. */
export function importFavorites(items) {
  const fresh = newFavorites(items);
  if (!fresh.length) return 0;
  const folders = listFolders();
  const placed = fresh.map((item) => {
    const existing = item.group && folders.find((folder) => sameFolder(folder, item.group));
    if (item.group && !existing) folders.push(item.group);
    return { ...item, group: existing || item.group };
  });
  return write(FAVORITES_KEY, [...placed, ...listFavorites()]) ? fresh.length : -1;
}

const closedFolders = () => {
  const list = read(CLOSED_FOLDERS_KEY);
  return Array.isArray(list) ? list.filter((key) => typeof key === 'string') : [];
};

export const isFolderClosed = (folder) => closedFolders().includes(folder.toLocaleLowerCase());

export function setFolderClosed(folder, closed) {
  const key = folder.toLocaleLowerCase();
  const others = closedFolders().filter((other) => other !== key);
  return write(CLOSED_FOLDERS_KEY, closed ? [...others, key] : others);
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
