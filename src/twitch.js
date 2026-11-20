// Twitch's live status, from the free public ivr.fi feed. No key or login.
// One request per channel is kept for a minute, and shared by Add stream and the guide.

const ENDPOINT = 'https://api.ivr.fi/v2/twitch/user?login=';
const TTL = 60 * 1000;
const asks = new Map();

const httpsOnly = (value) => (typeof value === 'string' && /^https:\/\//.test(value) ? value : '');

/** Turns the feed's user record into the small shape the cards use. Also used by the tests. */
export function readTwitchStatus(payload, login) {
  const wanted = String(login || '').trim().toLocaleLowerCase();
  if (!wanted) return null;
  const rows = Array.isArray(payload) ? payload : payload ? [payload] : [];
  const user = rows.find((row) => String(row?.login || '').toLocaleLowerCase() === wanted);
  if (!user) return null;
  const stream = user.stream && typeof user.stream === 'object' ? user.stream : null;
  const live = Boolean(stream) && stream.type !== 'error';
  const started = live ? Date.parse(stream.createdAt) : NaN;
  const viewers = live ? Number(stream.viewersCount) : 0;
  return {
    live,
    login: String(user.login || wanted).toLocaleLowerCase(),
    name: String(user.displayName || user.login || login),
    logo: httpsOnly(user.logo),
    title: live ? String(stream.title || '') : '',
    game: live ? String(stream.game?.displayName || '') : '',
    viewers: Number.isFinite(viewers) && viewers > 0 ? Math.round(viewers) : 0,
    startedAt: Number.isFinite(started) ? started : 0,
  };
}

/** Live/offline details for a channel name, or null if Twitch's feed can't be reached. */
export function twitchStatus(channel) {
  const login = String(channel || '').trim().toLocaleLowerCase();
  if (!login) return Promise.resolve(null);
  const known = asks.get(login);
  if (known && Date.now() - known.at < TTL) return known.ask;
  const ask = fetch(`${ENDPOINT}${encodeURIComponent(login)}`, {
    signal: AbortSignal.timeout?.(6000),
    headers: { accept: 'application/json' },
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => readTwitchStatus(data, login))
    .catch(() => null);
  asks.set(login, { at: Date.now(), ask });
  return ask;
}

/** 25,143 -> "25k", 1,250,000 -> "1.3M". */
export function viewerCount(count) {
  const value = Number(count) || 0;
  if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
}
