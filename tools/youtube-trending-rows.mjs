// Reading YouTube Data API rows for the Trending on YouTube home row. Kept separate so the
// parsing and Shorts filter can be tested without the network.

/** The categories the row can show. Film & Animation and Education are deliberately absent. */
export const YOUTUBE_CATEGORIES = [
  { id: 'all', name: 'All', api: '' },
  { id: 'music', name: 'Music', api: '10' },
  { id: 'sports', name: 'Sports', api: '17' },
  { id: 'comedy', name: 'Comedy', api: '23' },
  { id: 'entertainment', name: 'Entertainment', api: '24' },
  { id: 'news', name: 'News & Politics', api: '25' },
  { id: 'science', name: 'Science & Technology', api: '28' },
  { id: 'movies', name: 'Movies', api: '30' },
  { id: 'shows', name: 'Shows', api: '43' },
];

/** YouTube Shorts now run to three minutes, so keep anything comfortably longer. */
export const MIN_SECONDS = 181;

/** "PT1H2M3S" → 3723. "P0D" and anything malformed → 0. */
export function durationSeconds(value) {
  const found = String(value || '').match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!found) return 0;
  return (Number(found[1]) || 0) * 86400
    + (Number(found[2]) || 0) * 3600
    + (Number(found[3]) || 0) * 60
    + (Number(found[4]) || 0);
}

const decode = (value) => String(value || '')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .trim();

const thumb = (snippet) => {
  const images = snippet?.thumbnails ?? {};
  const url = images.maxres?.url || images.standard?.url || images.high?.url || images.medium?.url || images.default?.url || '';
  return /^https:\/\//.test(url) ? url : '';
};

/** One API video as a home card, or null for a Short, live/upcoming item, or bad row. */
export function videoRow(item) {
  const id = String(item?.id || '');
  const title = decode(item?.snippet?.title);
  if (!/^[\w-]{11}$/.test(id) || !title) return null;
  const duration = durationSeconds(item?.contentDetails?.duration);
  if (duration < MIN_SECONDS) return null;
  const live = item?.snippet?.liveBroadcastContent;
  if (live === 'live' || live === 'upcoming') return null;
  return {
    id,
    title,
    channel: decode(item?.snippet?.channelTitle),
    views: Number(item?.statistics?.viewCount) || 0,
    published: String(item?.snippet?.publishedAt || ''),
    thumbnail: thumb(item?.snippet),
    duration,
  };
}

/** The best rows from one mostPopular answer, Shorts and live items removed. */
export function categoryRows(items, limit = 12) {
  const seen = new Set();
  const rows = [];
  for (const item of Array.isArray(items) ? items : []) {
    const row = videoRow(item);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
    if (rows.length >= limit) break;
  }
  return rows;
}
