// Bluesky's public AppView is readable without a key. The What's Hot feed is
// ranked by Bluesky itself; MULTIGRID filters it to posts with native video and
// plays the HLS playlist directly. Search is not used: anonymous search is 403.

const API = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getFeed';
const FEED = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';
const CACHE_MS = 5 * 60000;
const PAGE_LIMIT = 50;
const MAX_PAGES = 4;

let cached = null;
let cachedAt = 0;
let inflight = null;

const videoView = (embed) => {
  if (!embed || typeof embed !== 'object') return null;
  if (embed.$type === 'app.bsky.embed.video#view') return embed;
  if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
    return embed.media?.$type === 'app.bsky.embed.video#view' ? embed.media : null;
  }
  return null;
};

/** One Bluesky post as a playable video, or null when it has none. */
export function blueskyVideo(post) {
  const video = videoView(post?.embed);
  if (!video?.playlist) return null;
  const author = post.author || {};
  const handle = author.handle || author.did || '';
  const rkey = String(post.uri || '').split('/').pop();
  const width = Number(video.aspectRatio?.width) || 0;
  const height = Number(video.aspectRatio?.height) || 0;
  return {
    uri: post.uri || '',
    url: handle && rkey ? `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${encodeURIComponent(rkey)}` : 'https://bsky.app/',
    playlist: video.playlist,
    thumbnail: video.thumbnail || '',
    alt: video.alt || '',
    width,
    height,
    portrait: Boolean(width && height && height > width),
    text: String(post.record?.text || '').trim(),
    handle,
    name: author.displayName || handle,
    avatar: author.avatar || '',
    likes: Number(post.likeCount) || 0,
    reposts: Number(post.repostCount) || 0,
    indexedAt: post.indexedAt || '',
  };
}

/** Every video post in one getFeed response, in the feed's order. */
export function blueskyVideos(data) {
  const seen = new Set();
  const videos = [];
  for (const entry of data?.feed || []) {
    const video = blueskyVideo(entry?.post);
    if (!video || seen.has(video.uri)) continue;
    seen.add(video.uri);
    videos.push(video);
  }
  return videos;
}

const pageUrl = (cursor = '') => {
  const params = new URLSearchParams({ feed: FEED, limit: String(PAGE_LIMIT) });
  if (cursor) params.set('cursor', cursor);
  return `${API}?${params}`;
};

async function fetchVideos() {
  const seen = new Set();
  const videos = [];
  let cursor = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await fetch(pageUrl(cursor), {
      cache: 'no-cache',
      signal: AbortSignal.timeout?.(15000),
    });
    if (!response.ok) throw new Error(`Bluesky answered ${response.status}`);
    const data = await response.json();
    for (const video of blueskyVideos(data)) {
      if (seen.has(video.uri)) continue;
      seen.add(video.uri);
      videos.push(video);
    }
    cursor = data?.cursor || '';
    if (!cursor || videos.length >= 18) break;
  }
  // Portrait first: the shared tile is 9:16, but keep the feed's order otherwise.
  const portrait = videos.filter((video) => video.portrait);
  const other = videos.filter((video) => !video.portrait);
  return [...portrait, ...other].slice(0, 24);
}

/** Trending video posts from Bluesky, cached briefly because the app may reload a tile. */
export function loadBlueskyVideos({ force = false } = {}) {
  if (!force && cached && Date.now() - cachedAt < CACHE_MS) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = fetchVideos()
    .then((videos) => {
      if (videos.length) {
        cached = videos;
        cachedAt = Date.now();
        return videos;
      }
      if (cached) return cached;
      throw new Error('No videos in Bluesky trends right now.');
    })
    .finally(() => { inflight = null; });
  return inflight;
}
