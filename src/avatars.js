// Profile pictures for TikTok and X accounts in Favorites. Both sites' public pages carry the
// picture; MULTIGRID already reads those pages through r.jina.ai (free, about 20 requests a minute
// without a key) to play the accounts' videos, so the same reader finds the picture.
// Asked only for cards on screen, one at a time with a gap, and remembered: an X picture's address
// stays the same for weeks; a TikTok one is signed and stops working after about two days, so it's
// asked again just before then. Nothing found: the card keeps the site's logo.

const READER = 'https://r.jina.ai/';
const STORE = 'multigrid.avatars.v1';
const GAP = 3500;
const X_KEEP = 14 * 86400000;
const NONE_KEEP = 86400000;

/** The profile picture in a TikTok profile embed page (Markdown or HTML), or ''. */
export function tiktokAvatar(text) {
  const raw = String(text || '');
  const found = raw.match(/"avatar(?:Medium|Larger|Thumb)(?:Url)?":"([^"]+)"/)?.[1]
    || raw.match(/https:\/\/p\d+[-\w.]*tiktokcdn[-\w.]*\.com\/[^\s)"']*avt[^\s)"']*/)?.[0] || '';
  return found.replace(/\\u0026/g, '&').replace(/&amp;/g, '&').replace(/\\\//g, '/');
}

/** The profile picture in an X profile page, in its 400 × 400 size, or ''. */
export function xAvatar(text) {
  const found = String(text || '').match(/https:\/\/pbs\.twimg\.com\/profile_images\/\d+\/[\w-]+?(?:_(?:normal|bigger|mini|200x200|400x400))?\.(jpe?g|png|webp)/)?.[0] || '';
  return found ? found.replace(/_(normal|bigger|mini|200x200|400x400)(\.\w+)$/, '_400x400$2') : '';
}

/** When a signed TikTok picture address stops working (its x-expires), in ms. */
export function expiresAt(url) {
  const seconds = Number(String(url).match(/[?&]x-expires=(\d+)/)?.[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { return {}; } };
const write = (all) => { try { localStorage.setItem(STORE, JSON.stringify(all)); } catch { /* not remembered */ } };

function fresh(entry, now = Date.now()) {
  if (!entry) return false;
  if (!entry.url) return now - entry.at < NONE_KEEP;
  const ends = expiresAt(entry.url);
  return ends ? now < ends - 3600000 : now - entry.at < X_KEEP;
}

const queue = [];
const asking = new Map();
const WORKERS = 2; // two at a time, each with a gap: inside the reader's free limit
let running = 0;

async function work() {
  running++;
  while (queue.length) {
    const job = queue.shift();
    let url = '';
    let busy = false;
    try {
      const response = await fetch(`${READER}${job.page}`, { cache: 'no-cache', signal: AbortSignal.timeout?.(20000) });
      if (response.status === 429) busy = true;
      else if (response.ok) url = job.pick(await response.text());
    } catch { /* the logo stays */ }
    if (busy && (job.tries = (job.tries || 0) + 1) < 4) {
      // The reader is busy: try this one again a little later, and remember nothing yet.
      queue.push(job);
      await new Promise((wait) => setTimeout(wait, 15000));
      continue;
    }
    const all = read();
    all[job.key] = { url, at: Date.now() };
    write(all);
    asking.delete(job.key);
    job.done(url);
    if (queue.length) await new Promise((wait) => setTimeout(wait, GAP));
  }
  running--;
}
const pump = () => { while (running < WORKERS && running < queue.length) work(); };

/** The account's picture address ('' if none). `kind` is 'tiktok' or 'x'. */
export function avatarFor(kind, name) {
  const handle = String(name || '').replace(/^@/, '').toLowerCase();
  if (!handle) return Promise.resolve('');
  const key = `${kind}:${handle}`;
  const saved = read()[key];
  if (fresh(saved)) return Promise.resolve(saved.url);
  if (!asking.has(key)) {
    asking.set(key, new Promise((done) => {
      const page = kind === 'tiktok' ? `https://www.tiktok.com/embed/@${encodeURIComponent(handle)}?lang=en-US` : `https://x.com/${encodeURIComponent(handle)}`;
      queue.push({ key, page, pick: kind === 'tiktok' ? tiktokAvatar : xAvatar, done });
      pump();
    }));
  }
  return asking.get(key);
}

/** A remembered picture that didn't load: forget it, so it's asked for again next time. */
export function forgetAvatar(kind, name) {
  const all = read();
  delete all[`${kind}:${String(name || '').replace(/^@/, '').toLowerCase()}`];
  write(all);
}
