// Where you stopped in a long video or podcast, remembered on this device so it starts there
// next time. Only things over 10 minutes, stopped after the first minute and before the end.

import { el } from './ui.js';

const STORE = 'multigrid.resume.v1';
const KEEP = 300;
const MIN_LENGTH = 10 * 60;
const MIN_PLAYED = 60;

const readAll = () => {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) || '{}');
    return all && typeof all === 'object' ? all : {};
  } catch {
    return {};
  }
};
const writeAll = (all) => {
  try { localStorage.setItem(STORE, JSON.stringify(all)); } catch { /* not remembered */ }
};

/** The second to start from, or 0. */
export function resumePoint(key) {
  const point = readAll()[key];
  return point && Number.isFinite(point.at) ? point.at : 0;
}

/**
 * Remembers the place, or forgets it once something is short, barely started or finished.
 * meta says what it is, for Continue watching: { input, name, from }. input is the link that
 * opens it again; from is where it came from (a channel or favorite), shown under the name.
 */
export function notePlace(key, seconds, length, meta) {
  if (!key || !Number.isFinite(seconds) || !Number.isFinite(length) || length <= 0) return;
  // Reaching the last 5% counts as played, for the Podcasts shelf.
  if (seconds >= length * 0.95) markPlayed(key);
  const all = readAll();
  const worth = length >= MIN_LENGTH && seconds >= MIN_PLAYED && seconds < length * 0.95;
  if (worth) {
    const known = all[key] || {};
    const what = meta && meta.input ? meta : known;
    all[key] = {
      at: Math.floor(seconds),
      length: Math.round(length),
      saved: Date.now(),
      ...(what.input ? { input: what.input, name: what.name || '', from: what.from || '' } : {}),
      // A series' card opens the episode it's on.
      ...(what.input && what.page ? { page: what.page } : {}),
    };
    const keys = Object.keys(all);
    if (keys.length > KEEP) {
      keys.sort((a, b) => (all[a].saved || 0) - (all[b].saved || 0)).slice(0, keys.length - KEEP).forEach((old) => delete all[old]);
    }
  } else if (all[key]) {
    delete all[key];
  } else {
    return;
  }
  writeAll(all);
  changed();
}

/* Played: things listened to (or watched) to the end, newest last. Kept to the newest 500. */
const PLAYED = 'multigrid.played.v1';
const readPlayed = () => {
  try {
    const list = JSON.parse(localStorage.getItem(PLAYED) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};
function markPlayed(key) {
  const list = readPlayed();
  if (list.includes(key)) return;
  list.push(key);
  try { localStorage.setItem(PLAYED, JSON.stringify(list.slice(-500))); } catch { /* not remembered */ }
  changed();
}
/** Whether something was played to the end. */
export const isPlayed = (key) => readPlayed().includes(key);
/** How far into something you are: { at, length }, or null. */
export function placeOf(key) {
  const point = readAll()[key];
  return point && Number.isFinite(point.at) ? { at: point.at, length: point.length || 0 } : null;
}

/** A website tile's saved place (a series): { at, length, page }, or null. page is the episode it's on. */
export function embedPlace(input) {
  const point = readAll()[`embed:${input}`];
  return point && Number.isFinite(point.at) ? { at: point.at, length: point.length || 0, page: point.page || '' } : null;
}

/** Continue watching: things part-watched that can be opened again, newest first. */
export function listPlaces(limit = 10) {
  const all = readAll();
  return Object.entries(all)
    .filter(([, point]) => point.input && point.name && point.length)
    .sort(([, a], [, b]) => (b.saved || 0) - (a.saved || 0))
    .slice(0, limit)
    .map(([key, point]) => ({ key, ...point }));
}

// Continue watching redraws when a place is saved or forgotten.
const watchers = new Set();
const changed = () => watchers.forEach((watch) => watch());
export function onPlacesChange(watch) { watchers.add(watch); }

export function forgetPlace(key) {
  const all = readAll();
  if (!all[key]) return;
  delete all[key];
  writeAll(all);
  changed();
}

/** 23:14, or 1:02:05 for an hour or more. */
export function timeText(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** The small "Resumed at 23:14 · Start over" note, shown for a few seconds over the player. */
export function showResumed(holder, seconds, onStartOver) {
  if (!holder) return;
  holder.querySelector('.resume-note')?.remove();
  const note = el('div', { class: 'resume-note', role: 'status' },
    el('span', { textContent: `Resumed at ${timeText(seconds)}` }),
    el('button', { type: 'button', textContent: 'Start over', on: { click() { onStartOver(); note.remove(); } } }));
  holder.append(note);
  setTimeout(() => note.remove(), 7000);
}

/**
 * Remembers the place in a browser video or audio element. keyOf() names what's playing
 * (or '' to skip it); holderOf() is where the note goes. Live streams never have an end,
 * so they're never remembered. metaOf() says what it is, for Continue watching. Returns a
 * function that saves the place right now.
 */
export function rememberMedia(media, keyOf, holderOf, metaOf = () => null) {
  const checked = new Set();
  let lastKept = 0;
  let settling = null;
  const keep = () => {
    if (settling !== null) return;
    const key = keyOf();
    if (key && Number.isFinite(media.duration)) notePlace(key, media.currentTime, media.duration, metaOf());
  };
  media.addEventListener('loadedmetadata', () => {
    const key = keyOf();
    if (!key || checked.has(key) || !Number.isFinite(media.duration)) return;
    checked.add(key);
    const point = resumePoint(key);
    if (!point || point >= media.duration * 0.95) return;
    // Some stream players move to the start once they begin, so the place is held until
    // playback is under way, and nothing is saved over it in the meantime.
    settling = point;
    media.currentTime = point;
    const hold = () => {
      if (settling === null) return;
      if (media.currentTime < settling - 5) media.currentTime = settling;
      else if (!media.paused && media.currentTime >= settling + 2) settling = null;
    };
    media.addEventListener('timeupdate', hold);
    setTimeout(() => { settling = null; media.removeEventListener('timeupdate', hold); }, 15000);
    showResumed(holderOf(), point, () => { settling = null; media.currentTime = 0; forgetPlace(key); });
  });
  media.addEventListener('timeupdate', () => {
    if (Date.now() - lastKept < 10000) return;
    lastKept = Date.now();
    keep();
  });
  media.addEventListener('pause', keep);
  media.addEventListener('ended', keep);
  // Where it is right now, for "Send to phone".
  keep.place = () => {
    const key = keyOf();
    return key && Number.isFinite(media.duration) ? { key, at: Math.floor(media.currentTime), length: Math.round(media.duration) } : null;
  };
  return keep;
}
