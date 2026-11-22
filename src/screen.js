// Screen/tab sharing as a live tile. The stream itself stays in this page's memory; a layout
// only stores a placeholder, so a reload asks for the screen again.

export const SCREEN_PREFIX = 'screen:';

let sequence = 0;
const streams = new Map();

export const screenSupported = () => typeof navigator !== 'undefined'
  && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

export function newScreenId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  sequence += 1;
  return `screen-${Date.now().toString(36)}-${sequence}`;
}

export function screenInput(id, label) {
  const clean = String(label || 'Shared screen').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Shared screen';
  return `${SCREEN_PREFIX}${String(id)}:${encodeURIComponent(clean)}`;
}

export function parseScreenInput(input) {
  const match = String(input ?? '').match(/^screen:([a-z0-9-]+):?(.*)$/i);
  if (!match) return { ok: false, input, error: "That screen share isn't complete." };
  let label = match[2] || 'Shared screen';
  try { label = decodeURIComponent(label); } catch { /* shown as it is */ }
  return { ok: true, input, kind: 'screen', label: label || 'Shared screen', screenId: match[1], openUrl: null };
}

/** Ask Chrome for a tab/window/screen. Must be called from a click. */
export async function chooseScreen() {
  if (!screenSupported()) throw new Error('This browser cannot share a screen.');
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  const track = stream.getVideoTracks()[0];
  if (!track) {
    stream.getTracks().forEach((item) => item.stop());
    throw new Error('Nothing was shared.');
  }
  const raw = String(track.label || '').replace(/\s+/g, ' ').trim();
  const label = /^[A-Za-z0-9+/=]{40,}$/.test(raw) ? 'Shared screen' : raw.slice(0, 120);
  return { stream, label: label || 'Shared screen' };
}

export function rememberScreen(id, stream) {
  const old = streams.get(id);
  if (old && old !== stream) old.getTracks().forEach((track) => track.stop());
  streams.set(id, stream);
}

export const screenStream = (id) => streams.get(id) || null;

export function forgetScreen(id) {
  const stream = streams.get(id);
  streams.delete(id);
  stream?.getTracks().forEach((track) => track.stop());
}
