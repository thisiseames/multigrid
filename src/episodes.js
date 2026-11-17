// When a series' next episode airs, from TVmaze's free TV database. A device remembers each
// answer for 12 hours, so a day's worth of opening Add stream asks about each show twice at most.

const STORE = 'multigrid.episodes.v1';
const KEEP_FOR = 12 * 3600000;
const asks = new Map();

const readAll = () => {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) || '{}');
    return all && typeof all === 'object' ? all : {};
  } catch {
    return {};
  }
};

const stamp = (episode) => {
  const time = Date.parse(episode?.airstamp || '');
  return Number.isFinite(time) ? time : null;
};

/** { show, next: { at, season, number, name }, last: { at } }, either part may be null. */
export function episodeFor(name) {
  const key = String(name || '').trim().toLocaleLowerCase();
  if (!key) return Promise.resolve(null);
  const known = readAll()[key];
  if (known && Date.now() - known.checked < KEEP_FOR) return Promise.resolve(known);
  if (asks.has(key)) return asks.get(key);
  const url = `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(name.trim())}&embed[]=nextepisode&embed[]=previousepisode`;
  const ask = fetch(url, { signal: AbortSignal.timeout?.(6000) })
    .then((response) => (response.status === 404 ? {} : response.ok ? response.json() : null))
    .then((show) => {
      if (!show) return null; // A busy moment: try again next time.
      const next = show._embedded?.nextepisode;
      const last = show._embedded?.previousepisode;
      const found = {
        show: show.name || name,
        next: stamp(next) ? { at: stamp(next), season: next.season ?? null, number: next.number ?? null, name: next.name || '' } : null,
        last: stamp(last) ? { at: stamp(last) } : null,
        checked: Date.now(),
      };
      try {
        const all = readAll();
        all[key] = found;
        localStorage.setItem(STORE, JSON.stringify(all));
      } catch { /* asked again next time */ }
      return found;
    })
    .catch(() => null)
    .finally(() => asks.delete(key));
  asks.set(key, ask);
  return ask;
}

const startOfDay = (time) => {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
};

/** Whether an episode comes out today: the next one airs today, or the last one did. */
export function isNewToday(info, now = Date.now()) {
  const today = startOfDay(now);
  return [info?.next?.at, info?.last?.at].some((at) => at && startOfDay(at) === today);
}

/** "S4 E6" when known. */
export const episodeCode = (next) => (next?.season && next?.number ? `S${next.season} E${next.number}` : '');
