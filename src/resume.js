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

/** Remembers the place, or forgets it once something is short, barely started or finished. */
export function notePlace(key, seconds, length) {
  if (!key || !Number.isFinite(seconds) || !Number.isFinite(length) || length <= 0) return;
  const all = readAll();
  const worth = length >= MIN_LENGTH && seconds >= MIN_PLAYED && seconds < length * 0.95;
  if (worth) {
    all[key] = { at: Math.floor(seconds), saved: Date.now() };
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
}

export function forgetPlace(key) {
  const all = readAll();
  if (!all[key]) return;
  delete all[key];
  writeAll(all);
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
