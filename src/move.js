// Moving MULTIGRID to a new address (multigrid.club). A browser keeps each address's saved things
// apart, so the new address starts empty. "Copy move link" packs everything this browser keeps for
// MULTIGRID (favorites, layouts, Continue watching, the sync and Reader keys, the TikTok list,
// settings) into one link; opening or pasting that link at the new address puts it all back.
// The data rides after the "#", which browsers never send to any server, so it goes nowhere but
// the device it's opened on. Caches that rebuild themselves (pictures, weather...) are left out.
// Files played from this computer can't move: browsers tie those to the address.

export const NEW_HOME = 'https://multigrid.club/';
const PREFIX = 'multigrid.';
const MARK = '#move=';
const SKIP = /^multigrid\.(avatars|trends|polymarket|weather|posters|moviePosters|x\.feeds|x\.videos|tiktok\.accounts|matches|standings|page)\b/;

/** The old address, where "Copy move link" is offered. */
export const isOldHome = () => location.hostname === 'thisiseames.github.io' || readKey('multigrid.movefrom') === 'here';
function readKey(key) { try { return localStorage.getItem(key); } catch { return null; } }

const toB64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
async function squeeze(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/** Everything worth moving, as { key: value }. */
export function collect(storage = localStorage) {
  const out = {};
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(PREFIX) && !SKIP.test(key)) out[key] = storage.getItem(key);
  }
  return out;
}

/** The move link: the new address with everything packed after "#move=". */
export async function moveLink(home = NEW_HOME, storage = localStorage) {
  const packed = await squeeze(new TextEncoder().encode(JSON.stringify({ v: 1, at: Date.now(), items: collect(storage) })), new CompressionStream('deflate-raw'));
  return `${home}${MARK}${toB64(packed)}`;
}

/** What a move link (or the page's own address) carries: { items } or null. */
export async function readMove(text) {
  const at = String(text || '').indexOf(MARK);
  if (at === -1) return null;
  try {
    const raw = String(text).slice(at + MARK.length).trim().replace(/[^\w-]/g, '');
    const data = JSON.parse(new TextDecoder().decode(await squeeze(fromB64(raw), new DecompressionStream('deflate-raw'))));
    return data && typeof data.items === 'object' ? data : null;
  } catch {
    return null;
  }
}

/** Puts a move's things into this browser. Returns how many were put back. */
export function applyMove(data, storage = localStorage) {
  let count = 0;
  for (const [key, value] of Object.entries(data.items)) {
    if (!key.startsWith(PREFIX) || typeof value !== 'string') continue;
    try { storage.setItem(key, value); count++; } catch { /* storage full: the rest still goes in */ }
  }
  return count;
}
