// Kick's live status, from its public channel page data. Kick does not send CORS headers, so the
// same free r.jina.ai reader MULTIGRID already uses fetches the JSON. No key or login. One ask
// per channel is kept for a minute, and the Live menu fails quietly to Offline's "Checking…"
// state when the reader is busy.

const ENDPOINT = 'https://r.jina.ai/https://kick.com/api/v2/channels/';
const TTL = 60 * 1000;
const asks = new Map();

const httpsOnly = (value) => (typeof value === 'string' && /^https:\/\//.test(value) ? value : '');

const kickTime = (value) => {
  const text = String(value || '').trim();
  if (!text) return 0;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}Z` : text;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : 0;
};

/** Turns Kick's channel JSON (or the reader's text wrapper) into the shape the Live rows use. */
export function readKickStatus(payload, channel) {
  const wanted = String(channel || '').trim().toLocaleLowerCase();
  let data = payload;
  if (typeof payload === 'string') {
    const start = payload.indexOf('{');
    const end = payload.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try { data = JSON.parse(payload.slice(start, end + 1)); } catch { return null; }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const slug = String(data.slug || data.user?.username || wanted).toLocaleLowerCase();
  if (!slug) return null;
  if (wanted && slug !== wanted) return null;
  if (!data.slug && !data.user) return null;

  const stream = data.livestream && typeof data.livestream === 'object' ? data.livestream : null;
  const live = Boolean(stream) && stream.is_live !== false;
  const viewers = live ? Number(stream.viewer_count) : 0;
  const avatar = httpsOnly(data.user?.profile_pic) || httpsOnly(stream?.thumbnail?.url);
  return {
    live,
    username: slug,
    name: String(data.user?.username || data.slug || channel || slug),
    avatar,
    title: live ? String(stream.session_title || '') : '',
    game: live ? String(stream.categories?.[0]?.name || '') : '',
    viewers: Number.isFinite(viewers) && viewers > 0 ? Math.round(viewers) : 0,
    startedAt: live ? kickTime(stream.start_time) : 0,
  };
}

/** Live/offline details for a Kick channel, or null if the reader can't be reached. */
export function kickStatus(channel) {
  const slug = String(channel || '').trim().toLocaleLowerCase();
  if (!/^[a-z0-9_.-]{2,30}$/.test(slug)) return Promise.resolve(null);
  const known = asks.get(slug);
  if (known && Date.now() - known.at < TTL) return known.ask;
  const ask = fetch(`${ENDPOINT}${encodeURIComponent(slug)}`, {
    cache: 'no-cache',
    signal: AbortSignal.timeout?.(9000),
    headers: { accept: 'text/plain' },
  })
    .then((response) => (response.ok ? response.text() : null))
    .then((text) => readKickStatus(text, slug))
    .catch(() => null);
  asks.set(slug, { at: Date.now(), ask });
  return ask;
}
