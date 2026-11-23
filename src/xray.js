// X-Ray: what's on a tile, in depth. Shows and episodes from TVmaze (free, no key), games from
// ESPN's game summary (the same source as the box score). Worked out here without the page so it
// can be tested; the page fetches, caches and draws.

const TVMAZE = 'https://api.tvmaze.com';
export const CAST_LIMIT = 8;

/** TVmaze's HTML summaries as plain text. */
export function plainText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const httpsImage = (image) => {
  const url = image?.medium || image?.original || '';
  return /^https:\/\/static\.tvmaze\.com\//.test(url) ? url : '';
};

/** The address that finds a show by name, with its cast and next/previous episodes. */
export const showSearchUrl = (name) => `${TVMAZE}/singlesearch/shows?q=${encodeURIComponent(String(name).trim())}&embed[]=cast&embed[]=nextepisode&embed[]=previousepisode`;
/** The address of one episode by season and number. */
export const episodeUrl = (showId, season, number) => `${TVMAZE}/shows/${showId}/episodebynumber?season=${season}&number=${number}`;

/** A TVmaze show (from showSearchUrl) as what X-Ray shows. */
export function parseShow(show) {
  if (!show?.id || !show.name) return null;
  const embedded = show._embedded ?? {};
  const episode = (ep) => (ep?.name ? { season: ep.season, number: ep.number, name: ep.name, airdate: ep.airdate || '', summary: plainText(ep.summary) } : null);
  return {
    id: show.id,
    name: show.name,
    image: httpsImage(show.image),
    summary: plainText(show.summary),
    network: show.network?.name || show.webChannel?.name || '',
    url: /^https:\/\/www\.tvmaze\.com\//.test(show.url || '') ? show.url : '',
    cast: (embedded.cast ?? []).slice(0, CAST_LIMIT).map((role) => ({
      name: role.person?.name || '',
      character: role.character?.name || '',
      photo: httpsImage(role.character?.image) || httpsImage(role.person?.image),
    })).filter((role) => role.name),
    castCount: (embedded.cast ?? []).length,
    next: episode(embedded.nextepisode),
    previous: episode(embedded.previousepisode),
  };
}

/** One TVmaze episode as what X-Ray shows. */
export function parseEpisode(ep) {
  if (!ep?.name) return null;
  return { season: ep.season, number: ep.number, name: ep.name, airdate: ep.airdate || '', summary: plainText(ep.summary) };
}

/** The episode before S{season}E{number}: the one before in the same season, else none known here. */
export const previousNumber = (season, number) => (number > 1 ? { season, number: number - 1 } : null);

/** ESPN's official clips for a game, newest first: [{ id, title, url, thumb, seconds, published }]. */
export function replayClips(summary) {
  return (Array.isArray(summary?.videos) ? summary.videos : [])
    .map((video) => {
      const source = video?.links?.source ?? {};
      const url = source.HD?.href || source.href || '';
      return {
        id: String(video?.id ?? url),
        title: String(video?.headline || video?.title || '').trim(),
        url: /^https:\/\/[^ ]+\.mp4(\?|$)/.test(url) ? url : '',
        thumb: /^https:\/\//.test(video?.thumbnail || '') ? video.thumbnail : '',
        seconds: Number(video?.duration) || 0,
        published: Date.parse(video?.originalPublishDate || video?.lastModified || '') || 0,
      };
    })
    .filter((clip) => clip.url && clip.title)
    .sort((a, b) => b.published - a.published);
}

/** A game's scoring plays, in order: [{ text, clock, team }] (NFL scoring plays, football goals). */
export function scoringPlays(summary, path = '') {
  if (path.startsWith('soccer')) {
    return (summary?.keyEvents ?? [])
      .filter((event) => event?.scoringPlay)
      .map((event) => ({ text: String(event.text || event.shortText || '').trim(), clock: event.clock?.displayValue || '', team: event.team?.abbreviation || event.team?.displayName || '' }))
      .filter((play) => play.text);
  }
  return (summary?.scoringPlays ?? [])
    .map((play) => ({ text: String(play.text || '').trim(), clock: [play.period?.number ? `Q${play.period.number}` : '', play.clock?.displayValue || ''].filter(Boolean).join(' '), team: play.team?.abbreviation || '' }))
    .filter((play) => play.text);
}

/** The latest win chance in a game summary, as { home, away } percentages, or null. */
export function winChance(summary) {
  const last = Array.isArray(summary?.winprobability) ? summary.winprobability[summary.winprobability.length - 1] : null;
  if (!Number.isFinite(last?.homeWinPercentage)) return null;
  const home = Math.round(last.homeWinPercentage * 100);
  return { home, away: 100 - home };
}

/** "4 min ago", "2 hr ago", "just now". */
export function agoText(time, now = Date.now()) {
  const minutes = Math.floor((now - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} hr ago`;
}
