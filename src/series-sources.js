// The three places a series can play. Atlantic and Cinejoy use the same TMDB number in their
// watch links; 1Flex uses it in its play link. The season and episode come along, so a repair
// opens the exact episode, not the show's first page.

const ATLANTIC_HOST = 'atlantic.bz';
const CINEJOY_HOST = 'cinejoy.pk';
const FLEX_HOST = '1flex.org';

export const SERIES_SOURCE_LABELS = { atlantic: 'Atlantic', flex: '1Flex', cinejoy: 'Cinejoy' };

const integer = (value, max = 999) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= max ? number : 1;
};

const tmdbId = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number < 10_000_000 ? number : 0;
};

/** The source, TMDB id and episode in a series link, or null for anything else. */
export function seriesLink(input) {
  let url;
  try { url = new URL(String(input)); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLocaleLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  // Atlantic films are /watch/<tmdb>; only the four-part /watch/<tmdb>/<season>/<episode>
  // shape is a series. The film is read by films.js as an Atlantic film.
  if (host === ATLANTIC_HOST && parts[0] === 'watch' && parts.length >= 4) {
    const tmdb = tmdbId(parts[1]);
    return tmdb ? { source: 'atlantic', tmdb, season: integer(parts[2]), episode: integer(parts[3]), url: url.href } : null;
  }
  if (host === CINEJOY_HOST && parts[0] === 'watch' && parts[1] === 'tv' && parts.length >= 3) {
    const tmdb = tmdbId(parts[2]);
    return tmdb ? { source: 'cinejoy', tmdb, season: integer(parts[3]), episode: integer(parts[4]), url: url.href } : null;
  }
  if (host === FLEX_HOST && parts[0] === 'play' && url.searchParams.get('type') === 'tv') {
    const tmdb = tmdbId(url.searchParams.get('id'));
    return tmdb ? { source: 'flex', tmdb, season: integer(url.searchParams.get('season')), episode: integer(url.searchParams.get('episode')), url: url.href } : null;
  }
  return null;
}

const token = () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
};

/** A 1Flex play link for one episode. The token is only its page's random marker. */
export function flexUrl(tmdb, season = 1, episode = 1, tokenValue = token()) {
  const id = tmdbId(tmdb);
  if (!id) return '';
  return `https://www.1flex.org/play?id=${id}&type=tv&season=${integer(season)}&episode=${integer(episode)}&token=${encodeURIComponent(tokenValue)}`;
}

/** An Atlantic watch link for one episode. */
export function atlanticUrl(tmdb, season = 1, episode = 1) {
  const id = tmdbId(tmdb);
  return id ? `https://atlantic.bz/watch/${id}/${integer(season)}/${integer(episode)}` : '';
}

/** An Atlantic film link: films have no season or episode. */
export function atlanticMovieUrl(tmdb) {
  const id = tmdbId(tmdb);
  return id ? `https://atlantic.bz/watch/${id}` : '';
}

/** A Cinejoy watch link for one episode. */
export function cinejoyUrl(tmdb, season = 1, episode = 1) {
  const id = tmdbId(tmdb);
  return id ? `https://cinejoy.pk/watch/tv/${id}/${integer(season)}/${integer(episode)}` : '';
}

/** That source's own search page, with the title filled in. */
export function seriesSearchUrl(source, query) {
  const text = String(query || '').trim();
  if (!text) return '';
  if (source === 'atlantic') return `https://atlantic.bz/search?q=${encodeURIComponent(text)}`;
  if (source === 'flex') return `https://www.1flex.org/search?q=${encodeURIComponent(text)}`;
  return '';
}
