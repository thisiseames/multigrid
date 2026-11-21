// Favorites and saved layouts kept the same on every device you pair. Each device keeps its own
// full copy; an encrypted copy waits on free public Nostr relays (the same kind of server the
// phone remote uses) so a device that was off catches up when it opens. Only devices holding
// the sync secret can read it. Pairing: one device shows a short code for 10 minutes, the other
// types it in, and the secret passes across, encrypted with that code.
// Each favorite and layout carries the time it last changed, so the newest change wins.

const STATE_KEY = 'multigrid.sync.v1';
const RELAYS = ['wss://relay.primal.net', 'wss://relay.snort.social', 'wss://nos.lol', 'wss://relay.damus.io'];
const KIND = 30078; // Nostr's kind for an app's own data
const DOC_TAG = 'multigrid-sync';
const PAIR_TAG = 'multigrid-pair';
const CODE_LETTERS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const PAIR_MINUTES = 10;
const FORGET_DELETED = 90 * 24 * 3600 * 1000;

/* ---------- What syncs, and merging (no network, so it can be tested) ---------- */

// Continue watching: the newest places sync, and files on a device stay on it.
const MAX_PLACES = 100;
const PLACE_FIELDS = ['at', 'length', 'input', 'name', 'from', 'page'];

/** Every favorite, saved layout and Continue watching place as keyed items. Files on this device stay here. */
export function itemsOf({ favorites, layouts, places = {} }) {
  const items = {};
  for (const { input, name, group, logo, poster } of favorites) {
    if (input.startsWith('local:')) continue;
    items[`f:${input}`] = { name, group: group || '', ...(logo ? { logo } : {}), ...(poster ? { poster } : {}) };
  }
  for (const { name, savedAt, workspace } of layouts) items[`l:${name}`] = { savedAt: savedAt || 0, workspace };
  const newest = Object.entries(places).filter(([key, point]) => !key.startsWith('file:') && point && Number.isFinite(point.at))
    .sort(([, a], [, b]) => (b.saved || 0) - (a.saved || 0)).slice(0, MAX_PLACES);
  for (const [key, point] of newest) {
    items[`p:${key}`] = Object.fromEntries(PLACE_FIELDS.filter((field) => point[field] !== undefined && point[field] !== '').map((field) => [field, point[field]]));
  }
  return items;
}

/** What changed since last time: new, edited and removed items, each stamped with now. */
export function stamp(items, seen, now) {
  const changes = {};
  for (const [key, value] of Object.entries(items)) {
    const h = JSON.stringify(value);
    if (seen[key]?.h !== h) changes[key] = { t: now, v: value };
  }
  for (const [key, known] of Object.entries(seen)) {
    if (!(key in items) && known.h !== null) changes[key] = { t: now, v: null };
  }
  return changes;
}

/** Both sides together: for each item, the newer change wins. Old removals are forgotten. */
export function merge(a, b, now = Date.now()) {
  const out = { ...a };
  for (const [key, entry] of Object.entries(b || {})) {
    if (!entry || !Number.isFinite(entry.t)) continue;
    if (!out[key] || entry.t > out[key].t) out[key] = entry;
  }
  for (const [key, entry] of Object.entries(out)) if (entry.v === null && now - entry.t > FORGET_DELETED) delete out[key];
  return out;
}

/** What this device has seen, from a merged doc. */
export const seenOf = (doc) => Object.fromEntries(Object.entries(doc).map(([key, { t, v }]) => [key, { t, h: v === null ? null : JSON.stringify(v) }]));

/** The favorites and layouts lists a doc stands for. Existing ones keep their place; files stay. */
export function listsOf(doc, { favorites, layouts }) {
  const live = (prefix) => Object.entries(doc).filter(([key, entry]) => key.startsWith(prefix) && entry.v !== null);
  const favs = new Map(live('f:').map(([key, entry]) => [key.slice(2), entry.v]));
  const kept = favorites.filter((item) => item.input.startsWith('local:') || favs.has(item.input))
    .map((item) => (item.input.startsWith('local:') ? item : { input: item.input, ...favs.get(item.input) }));
  const have = new Set(kept.map((item) => item.input));
  const added = [...favs].filter(([input]) => !have.has(input)).map(([input, value]) => ({ input, ...value }));
  const lays = live('l:').map(([key, entry]) => ({ name: key.slice(2), savedAt: entry.v.savedAt, workspace: entry.v.workspace }))
    .sort((x, y) => (y.savedAt || 0) - (x.savedAt || 0));
  // Places carry the time they last changed as "saved", so Continue watching keeps its order.
  const places = Object.fromEntries(live('p:').map(([key, entry]) => [key.slice(2), { ...entry.v, saved: entry.t }]));
  return { favorites: [...added, ...kept], layouts: lays, places };
}

/** A fresh pairing code like "K7Q2-M9XD". */
export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const letters = [...bytes].map((byte) => CODE_LETTERS[byte % CODE_LETTERS.length]).join('');
  return `${letters.slice(0, 4)}-${letters.slice(4)}`;
}
/** A typed code, tidied: capitals, no spaces or dashes. */
export const cleanCode = (text) => String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* ---------- Encryption ---------- */

const enc = new TextEncoder();
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
const squeeze = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

/** The signing key and the lock for a sync secret. */
export async function keysFor(secret) {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits', 'deriveKey']);
  const hkdf = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('multigrid'), info: enc.encode(info) });
  const sign = new Uint8Array(await crypto.subtle.deriveBits(hkdf('multigrid sync signing'), base, 256));
  const lock = await crypto.subtle.deriveKey(hkdf('multigrid sync data'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { sign, lock };
}

/** The signing key and the lock for a pairing code. Slow on purpose, so codes can't be guessed quickly. */
export async function pairKeysFor(code) {
  const base = await crypto.subtle.importKey('raw', enc.encode(cleanCode(code)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('multigrid-pair-v1'), iterations: 200000 }, base, 512));
  const lock = await crypto.subtle.importKey('raw', bits.slice(32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { sign: bits.slice(0, 32), lock };
}

export async function seal(value, lock) {
  const packed = await squeeze(enc.encode(JSON.stringify(value)), new CompressionStream('deflate-raw'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, lock, packed));
  const out = new Uint8Array(12 + sealed.length);
  out.set(iv);
  out.set(sealed, 12);
  return toB64(out);
}

/** Anything that isn't ours, or was changed on the way, gives null. */
export async function unseal(text, lock) {
  try {
    const bytes = fromB64(text);
    const packed = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, lock, bytes.slice(12));
    return JSON.parse(new TextDecoder().decode(await squeeze(new Uint8Array(packed), new DecompressionStream('deflate-raw'))));
  } catch {
    return null;
  }
}

/* ---------- Relays ---------- */

let lib = null;
const nostr = () => (lib ||= import('../vendor/nostr-lib.js'));

/** Talks to every relay at once. A relay that drops is tried again, a little later each time. */
function openRelays(filter, onEvent, onReady) {
  const sockets = new Map();
  let stopped = false;
  let readyTold = false;
  const queue = [];
  const tellReady = () => { if (!readyTold) { readyTold = true; onReady?.(); } };
  setTimeout(tellReady, 5000);
  const connect = (url, wait = 0) => {
    if (stopped) return;
    let ws;
    try { ws = new WebSocket(url); } catch { return; }
    sockets.set(url, ws);
    ws.onopen = () => {
      wait = 0;
      if (filter) ws.send(JSON.stringify(['REQ', 'mg', filter]));
      for (const event of queue) ws.send(JSON.stringify(['EVENT', event]));
    };
    ws.onmessage = (message) => {
      let data;
      try { data = JSON.parse(message.data); } catch { return; }
      if (data[0] === 'EVENT' && data[2]) onEvent?.(data[2]);
      if (data[0] === 'EOSE') tellReady();
    };
    ws.onclose = () => {
      if (stopped) return;
      const next = Math.min(60000, (wait || 2500) * 2);
      setTimeout(() => connect(url, next), next);
    };
    ws.onerror = () => ws.close();
  };
  RELAYS.forEach((url) => connect(url));
  return {
    publish(event) {
      // Only the newest note of each kind needs to wait for a relay that's still connecting.
      const dTag = event.tags.find((tag) => tag[0] === 'd')?.[1];
      const same = queue.findIndex((old) => old.kind === event.kind && old.tags.find((tag) => tag[0] === 'd')?.[1] === dTag);
      if (same !== -1) queue.splice(same, 1);
      queue.push(event);
      for (const ws of sockets.values()) if (ws.readyState === 1) ws.send(JSON.stringify(['EVENT', event]));
    },
    stop() {
      stopped = true;
      for (const ws of sockets.values()) ws.close();
    },
  };
}

async function signed(kind, tags, content, sign) {
  const { finalizeEvent } = await nostr();
  return finalizeEvent({ kind, created_at: Math.floor(Date.now() / 1000), tags, content }, sign);
}

/* ---------- This device's sync ---------- */

const readState = () => {
  try {
    const state = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    return state && typeof state.secret === 'string' ? state : null;
  } catch {
    return null;
  }
};
const writeState = (state) => {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* not kept */ }
};

export const isSyncing = () => Boolean(readState());
export const lastSynced = () => readState()?.lastSynced || 0;

let engine = null;
// Told when a note from another device arrives: how the device showing a code knows it was used.
const otherWatchers = new Set();

/**
 * Starts syncing on this device, if it's paired. store gives { read(), write(lists), onChange(fn) }
 * for the favorites and layouts; onApplied() runs after changes from another device came in.
 */
export async function startSync(store, onApplied) {
  const state = readState();
  if (!state || engine) return;
  const { sign, lock } = await keysFor(fromB64(state.secret));
  const { getPublicKey } = await nostr();
  const author = getPublicKey(sign);
  let doc = state.doc || {};
  let lastSent = '';
  let newest = 0;
  let timer = null;
  let sentAt = 0;

  const save = (extra = {}) => writeState({ ...readState(), doc, seen: seenOf(doc), ...extra });
  const send = async () => {
    const body = JSON.stringify(doc);
    if (body === lastSent) return;
    lastSent = body;
    const content = await seal({ by: state.device, items: doc }, lock);
    const at = Math.max(Math.floor(Date.now() / 1000), newest + 1);
    newest = at;
    sentAt = Date.now();
    const { finalizeEvent } = await nostr();
    relays.publish(finalizeEvent({ kind: KIND, created_at: at, tags: [['d', DOC_TAG]], content }, sign));
  };
  const local = () => {
    const changes = stamp(itemsOf(store.read()), readState()?.seen || {}, Date.now());
    if (!Object.keys(changes).length) return false;
    doc = merge(doc, changes);
    save();
    return true;
  };
  const onEvent = async (event) => {
    if (event.pubkey !== author || event.kind !== KIND) return;
    newest = Math.max(newest, event.created_at || 0);
    const note = await unseal(event.content, lock);
    if (!note || typeof note.items !== 'object') return;
    local();
    const merged = merge(doc, note.items);
    const changedHere = JSON.stringify(merged) !== JSON.stringify(doc);
    doc = merged;
    save({ lastSynced: Date.now() });
    if (changedHere) {
      store.write(listsOf(doc, store.read()));
      onApplied?.();
    }
    if (note.by && note.by !== state.device) otherWatchers.forEach((watch) => watch());
    // The other side was missing something this device has: send the full set back.
    if (JSON.stringify(note.items) !== JSON.stringify(doc)) send();
    else lastSent = JSON.stringify(doc);
  };
  const relays = openRelays({ kinds: [KIND], authors: [author], '#d': [DOC_TAG] }, onEvent, () => {
    // Once the relays have answered: whatever changed here while offline goes out.
    local();
    send();
  });
  // Favorites and layouts go out within seconds, and so does a pause. A place that moves while
  // something plays goes out at most once a minute, so the relays aren't asked every 10 seconds.
  const soon = () => { clearTimeout(timer); timer = null; if (local()) send(); };
  store.onChange((kind) => {
    clearTimeout(timer);
    const wait = kind === 'place' ? Math.max(1500, 60000 - (Date.now() - sentAt)) : 1500;
    timer = setTimeout(soon, wait);
  });
  // Leaving the page or switching away: whatever is waiting goes now.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && timer) soon(); });
  engine = { relays, sign, lock, stop: () => { relays.stop(); clearTimeout(timer); } };
}

export function stopSync() {
  engine?.stop();
  engine = null;
  try { localStorage.removeItem(STATE_KEY); } catch { /* nothing kept */ }
}

/**
 * Shows a code for another device: makes this device's sync secret if it has none, and leaves it
 * on the relays for 10 minutes, locked with the code. onJoined() runs once another device syncs.
 */
export async function offerCode(store, onApplied, onJoined) {
  let state = readState();
  if (!state) {
    state = { secret: toB64(crypto.getRandomValues(new Uint8Array(32))), device: toB64(crypto.getRandomValues(new Uint8Array(9))), doc: {}, seen: {} };
    writeState(state);
  }
  const code = newCode();
  const pair = await pairKeysFor(code);
  const until = Math.floor(Date.now() / 1000) + PAIR_MINUTES * 60;
  const note = await signed(KIND, [['d', PAIR_TAG], ['expiration', String(until)]], await seal({ secret: state.secret }, pair.lock), pair.sign);
  const relays = openRelays(null);
  relays.publish(note);
  let joined = false;
  const clear = async () => {
    // The code's note is no longer needed: replaced with an empty one and a request to delete it.
    relays.publish(await signed(KIND, [['d', PAIR_TAG], ['expiration', String(Math.floor(Date.now() / 1000) + 60)]], '', pair.sign));
    relays.publish(await signed(5, [['e', note.id], ['a', `${KIND}:${note.pubkey}:${PAIR_TAG}`]], '', pair.sign));
    setTimeout(() => relays.stop(), 5000);
  };
  setTimeout(() => { if (!joined) clear(); }, PAIR_MINUTES * 60 * 1000);
  const watch = () => {
    if (joined) return;
    joined = true;
    otherWatchers.delete(watch);
    clear();
    onJoined?.();
  };
  otherWatchers.add(watch);
  await startSync(store, onApplied);
  return code;
}

/** Joins with a code shown on another device. Resolves true once the sync secret came across. */
export async function joinWithCode(code, store, onApplied) {
  if (cleanCode(code).length !== 8) return false;
  const pair = await pairKeysFor(code);
  const { getPublicKey } = await nostr();
  const author = getPublicKey(pair.sign);
  const secret = await new Promise((resolve) => {
    const relays = openRelays({ kinds: [KIND], authors: [author], '#d': [PAIR_TAG] }, async (event) => {
      if (event.pubkey !== author) return;
      const found = await unseal(event.content, pair.lock);
      if (typeof found?.secret === 'string') { relays.stop(); resolve(found.secret); }
    });
    setTimeout(() => { relays.stop(); resolve(null); }, 12000);
  });
  if (!secret) return false;
  stopSync();
  writeState({ secret, device: toB64(crypto.getRandomValues(new Uint8Array(9))), doc: {}, seen: {} });
  await startSync(store, onApplied);
  return true;
}
