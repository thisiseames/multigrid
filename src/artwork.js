// Big pictures and descriptions for the home screen, from TVmaze (free, no key, open to pages):
// a show's wide background art (for the billboard and cards), its poster and its summary.
// Only an exact name match counts, so a programme like "PL: Spurs v Ipswich Hlts" never borrows a
// different show's picture. Answers are remembered on this device for a week (a miss for a day),
// and asked one at a time, since TVmaze allows about 20 requests every 10 seconds.

const STORE = 'multigrid.art.v1';
const KEEP = 7 * 86400000;
const MISS_KEEP = 86400000;
const API = 'https://api.tvmaze.com';

const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { return {}; } };
const write = (all) => { try { localStorage.setItem(STORE, JSON.stringify(all)); } catch { /* not remembered */ } };

/** "The Walking Dead", "the walking dead!" and "THE WALKING DEAD" are one name. */
export const sameName = (a, b) => {
  const plain = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
  return Boolean(plain(a)) && plain(a) === plain(b);
};

/** The summary as plain text: TVmaze sends a little HTML. */
export const plainText = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

/** The best wide background: the one closest to 1920 px wide, at least 1000 px. */
export function bestBackdrop(images) {
  const wide = (images || []).filter((image) => image.type === 'background' && image.resolutions?.original?.width >= 1000);
  wide.sort((a, b) => Math.abs(a.resolutions.original.width - 1920) - Math.abs(b.resolutions.original.width - 1920) || (b.main ? 1 : 0) - (a.main ? 1 : 0));
  return wide[0]?.resolutions.original.url || '';
}

let chain = Promise.resolve();
const asking = new Map();
const getJSON = (url) => fetch(url, { signal: AbortSignal.timeout?.(10000) }).then((response) => (response.ok ? response.json() : null)).catch(() => null);

/** { title, summary, backdrop, poster } for a show, or null when TVmaze has no show by that name. */
export function artFor(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return Promise.resolve(null);
  const saved = read()[key];
  if (saved && Date.now() - saved.at < (saved.miss ? MISS_KEEP : KEEP)) return Promise.resolve(saved.miss ? null : saved);
  if (!asking.has(key)) {
    const job = chain.then(async () => {
      const show = await getJSON(`${API}/singlesearch/shows?q=${encodeURIComponent(name)}`);
      let entry = { miss: true, at: Date.now() };
      if (show && sameName(show.name, name)) {
        const images = await getJSON(`${API}/shows/${show.id}/images`);
        entry = { title: show.name, summary: plainText(show.summary), backdrop: bestBackdrop(images), poster: show.image?.original || show.image?.medium || '', at: Date.now() };
      }
      const all = read();
      all[key] = entry;
      write(all);
      asking.delete(key);
      await new Promise((wait) => setTimeout(wait, 350));
      return entry.miss ? null : entry;
    });
    chain = job.catch(() => null);
    asking.set(key, job);
  }
  return asking.get(key);
}
