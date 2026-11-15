// The Reader: headlines from Eames's feeds (reader/index.json, refreshed by a GitHub job),
// and each story's cleaned-up text, which is saved locked. Only a device that has opened
// the unlock link holds the key, so the public project shows nothing readable.

const KEY_STORE = 'multigrid.readerkey.v1';
const READ_STORE = 'multigrid.readerread.v1';
export const KEY_PREFIX = '#readerkey=';

let index = null;
let loadedAt = 0;

export function loadIndex(force = false) {
  if (!force && index && Date.now() - loadedAt < 5 * 60 * 1000) return Promise.resolve(index);
  return fetch('reader/index.json', { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (data && Array.isArray(data.items)) {
        index = data;
        loadedAt = Date.now();
      }
      return index;
    })
    .catch(() => index);
}

export const itemById = (id) => index?.items.find((item) => item.id === id) ?? null;

/* The key */
const read = (name) => { try { return localStorage.getItem(name); } catch { return null; } };
const write = (name, value) => { try { localStorage.setItem(name, value); return true; } catch { return false; } };

export const hasKey = () => /^[\w-]{43}$/.test(read(KEY_STORE) || '');
export function saveKey(text) {
  const key = String(text || '').trim();
  if (!/^[\w-]{43}$/.test(key)) return false;
  return write(KEY_STORE, key);
}
/** A pasted or opened unlock link, or null. */
export function keyFromText(text) {
  const at = String(text || '').indexOf(KEY_PREFIX);
  return at === -1 ? null : String(text).slice(at + KEY_PREFIX.length).trim().split(/\s/)[0];
}

const fromBase64Url = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));

/** A story's text, unlocked: { title, byline, image, html, link }, or null. */
export async function openStory(id) {
  if (!hasKey()) return null;
  const response = await fetch(`reader/a/${encodeURIComponent(id)}.json`, { cache: 'force-cache' });
  if (!response.ok) return null;
  const { iv, data } = await response.json();
  const key = await crypto.subtle.importKey('raw', fromBase64Url(read(KEY_STORE)), 'AES-GCM', false, ['decrypt']);
  const squeezed = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(iv) }, key, fromBase64Url(data));
  const plain = await new Response(new Blob([squeezed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  return JSON.parse(plain);
}

/* What's been read, on this device */
export function readIds() {
  try { return new Set(JSON.parse(read(READ_STORE) || '[]')); } catch { return new Set(); }
}
export function markRead(id) {
  const ids = [...readIds().add(id)].slice(-1500);
  write(READ_STORE, JSON.stringify(ids));
}

/** "25 min ago", "3 hr ago", "Yesterday", "Nov 12". */
export function ago(time, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - time) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  if (hours < 48) return 'Yesterday';
  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/* Story HTML is rebuilt from a short list of safe tags, whatever arrives. */
const SAFE = new Set(['P', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'B', 'I', 'A', 'IMG', 'FIGURE', 'FIGCAPTION', 'BR']);
export function safeFragment(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const build = (node) => {
    const out = document.createDocumentFragment();
    for (const child of node.childNodes) {
      if (child.nodeType === 3) { out.append(document.createTextNode(child.textContent)); continue; }
      if (child.nodeType !== 1) continue;
      if (!SAFE.has(child.tagName)) { out.append(build(child)); continue; }
      const copy = document.createElement(child.tagName.toLowerCase());
      if (child.tagName === 'A') {
        const href = child.getAttribute('href') || '';
        if (/^https?:\/\//.test(href)) { copy.href = href; copy.target = '_blank'; copy.rel = 'noopener noreferrer'; }
      }
      if (child.tagName === 'IMG') {
        const src = child.getAttribute('src') || '';
        if (!/^https:\/\//.test(src)) continue;
        copy.src = src;
        copy.alt = child.getAttribute('alt') || '';
        copy.loading = 'lazy';
        copy.referrerPolicy = 'no-referrer';
      }
      copy.append(build(child));
      out.append(copy);
    }
    return out;
  };
  return build(doc.body.firstChild);
}
