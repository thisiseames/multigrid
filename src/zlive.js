// zlive.st's public embed manifest: 277 live channels, keyless and CORS-open. Its player
// takes white/accent/background options in the query, so a Zlive tile matches MULTIGRID.

const API = 'https://zlive.st/embed/manifest.json';
const CACHE_MS = 5 * 60_000;

export const ZLIVE_CATEGORIES = ['Sports', 'F1', 'Kids', 'Entertainment', 'Other'];

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const REGION_NAMES = {
  ca: 'Canada',
  canada: 'Canada',
  us: 'United States',
  usa: 'United States',
  'united states': 'United States',
};

const regionName = (value) => {
  const text = clean(value);
  return REGION_NAMES[text.toLocaleLowerCase()] || text;
};

function embedUrl(raw) {
  const text = clean(raw);
  if (!text) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || url.hostname.toLocaleLowerCase() !== 'zlive.st') return '';
    if (!/^\/embed\/[a-z0-9-]+$/i.test(url.pathname)) return '';
    return url.href;
  } catch {
    return '';
  }
}

/** The clean player URL with MULTIGRID's white controls and no Zlive title/branding. */
export function zliveEmbed(raw) {
  const base = embedUrl(raw);
  if (!base) return '';
  const url = new URL(base);
  url.searchParams.set('accent', 'f5f5f7');
  url.searchParams.set('bg', '0b0b0c');
  url.searchParams.set('title', '0');
  url.searchParams.set('brand', '0');
  url.searchParams.set('controls', 'auto');
  url.searchParams.set('frame', '0');
  return url.href;
}

/** One channel per id: live only, valid zlive embed URL, with its category and region. */
export function normalizeZlive(data) {
  const found = new Map();
  for (const item of Array.isArray(data?.channels) ? data.channels : []) {
    const name = clean(item?.name);
    const url = embedUrl(item?.url);
    if (!name || !url || item?.live === false) continue;
    const id = clean(item?.id) || url;
    if (found.has(id)) continue;
    found.set(id, {
      id,
      name,
      region: regionName(item?.region),
      flag: clean(item?.flag).toLocaleLowerCase(),
      quality: clean(item?.quality),
      category: clean(item?.sport) || 'Other',
      live: true,
      url,
    });
  }
  const rank = (name) => {
    const at = ZLIVE_CATEGORIES.indexOf(name);
    return at === -1 ? ZLIVE_CATEGORIES.length : at;
  };
  return [...found.values()].sort((a, b) => (
    rank(a.category) - rank(b.category)
    || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  ));
}

let cache = null;
let cachedAt = 0;
let pending = null;

/** The current Zlive channels, or null when the manifest is unavailable. */
export function loadZlive(force = false) {
  if (!force && cache && Date.now() - cachedAt < CACHE_MS) return Promise.resolve(cache);
  if (pending) return pending;
  pending = fetch(API, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout?.(8000),
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data || typeof data !== 'object' || !Array.isArray(data.channels)) return null;
      cache = normalizeZlive(data);
      cachedAt = Date.now();
      return cache;
    })
    .catch(() => null)
    .finally(() => { pending = null; });
  return pending;
}
