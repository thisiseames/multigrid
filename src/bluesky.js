// Bluesky's public AppView is readable without a key. The What's Hot feed is
// ranked by Bluesky itself; MULTIGRID filters it to posts with native video and
// plays the HLS playlist directly. Search is not used: anonymous search is 403.

const API = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getFeed';
const FEED = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';
const CACHE_MS = 5 * 60000;
const PAGE_LIMIT = 50;
const MAX_PAGES = 8;

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

/** Pet/cute posts are frequent in What's Hot and not what this feed is for. */
export const isPetVideo = (video) => /\b(cat|cats|kitten|kittens|kitty|dog|dogs|puppy|puppies|pet|pets|animal|animals|cute|meow|purr|doggo|paw|paws)\b/i.test(`${video?.text || ''} ${video?.alt || ''}`);

/** One Bluesky post as a playable video, or null when it has none. */
export function blueskyVideo(post) {
  const video = videoView(post?.embed);
  if (!video?.playlist) return null;
  const author = post.author || {};
  const handle = author.handle || author.did || '';
  const rkey = String(post.uri || '').split('/').pop();
  const width = Number(video.aspectRatio?.width) || 0;
  const height = Number(video.aspectRatio?.height) || 0;
  const langs = Array.isArray(post.record?.langs) ? post.record.langs.filter((lang) => typeof lang === 'string') : [];
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
    langs,
    english: langs.some((lang) => /^en(?:-|$)/i.test(lang)),
  };
}

/** Every video post in one getFeed response, in the feed's order. */
export function blueskyVideos(data, { englishOnly = false } = {}) {
  const seen = new Set();
  const videos = [];
  for (const entry of data?.feed || []) {
    const video = blueskyVideo(entry?.post);
    if (!video || (englishOnly && !video.english) || seen.has(video.uri)) continue;
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
    for (const video of blueskyVideos(data, { englishOnly: true })) {
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
      throw new Error('No English videos in Bluesky trends right now.');
    })
    .finally(() => { inflight = null; });
  return inflight;
}

const TOPICS_API = 'https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrendingTopics';
const TOPICS_CACHE_MS = 10 * 60000;
const TOPICS_LIMIT = 5;

let topicsCached = null;
let topicsCachedAt = 0;
let topicsInflight = null;

const topicLink = (value) => {
  const link = String(value || '').trim();
  return /^\/profile\/[^/?#]+\/feed\/[^/?#]+$/.test(link) ? link : '';
};

/** One Bluesky trend as Today needs it, or null when it has no usable feed link. */
export function blueskyTopic(item) {
  const link = topicLink(item?.link);
  if (!link) return null;
  const name = String(item?.displayName || item?.topic || '').trim();
  if (!name) return null;
  return {
    name,
    description: String(item?.description || '').trim(),
    url: `https://bsky.app${link}`,
  };
}

/** The first `limit` usable trends, dropping duplicates and links that aren't feeds. */
export function blueskyTopics(data, limit = TOPICS_LIMIT) {
  const seen = new Set();
  const topics = [];
  for (const item of data?.topics || []) {
    const topic = blueskyTopic(item);
    if (!topic || seen.has(topic.url)) continue;
    seen.add(topic.url);
    topics.push(topic);
    if (topics.length >= limit) break;
  }
  return topics;
}

async function fetchTopics() {
  const response = await fetch(`${TOPICS_API}?limit=10`, {
    cache: 'no-cache',
    signal: AbortSignal.timeout?.(10000),
  });
  if (!response.ok) throw new Error(`Bluesky answered ${response.status}`);
  const topics = blueskyTopics(await response.json());
  if (!topics.length) throw new Error('No Bluesky trends right now.');
  return topics;
}

/** Trending topics for Today, cached so reopening the panel doesn't ask again. */
export function loadBlueskyTopics({ force = false } = {}) {
  if (!force && topicsCached && Date.now() - topicsCachedAt < TOPICS_CACHE_MS) return Promise.resolve(topicsCached);
  if (topicsInflight) return topicsInflight;
  topicsInflight = fetchTopics()
    .then((topics) => {
      topicsCached = topics;
      topicsCachedAt = Date.now();
      return topics;
    })
    .finally(() => { topicsInflight = null; });
  return topicsInflight;
}
