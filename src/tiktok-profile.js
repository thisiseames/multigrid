// Public TikTok profiles through the same r.jina.ai reader the TikTok feeds already use.
// One profile request gives the header; TikTok's account embed gives ten recent videos, and
// ten video-page requests add their likes and comments. No key, login or server. Nothing is
// cached longer than ten minutes.

const READER = 'https://r.jina.ai/';
const PROFILE_TTL = 10 * 60 * 1000;
const VIDEO_LIMIT = 10;
const profileCache = new Map();
const profileInflight = new Map();

const decode = (value) => String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, code) => {
  const key = String(code).toLowerCase();
  if (key === 'amp') return '&';
  if (key === 'lt') return '<';
  if (key === 'gt') return '>';
  if (key === 'quot') return '"';
  if (key === 'apos') return "'";
  const number = key.startsWith('#x') ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
  return Number.isFinite(number) ? String.fromCodePoint(number) : match;
});

const count = (...values) => {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
};

const secondsFromId = (id) => {
  try { return Number(BigInt(id) >> 32n) || 0; } catch { return 0; }
};

const embedded = (html) => {
  const found = String(html || '').match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!found) return null;
  try { return JSON.parse(found[1]); } catch { return null; }
};

/** One profile video card from the profile page, or null when the card has no video id. */
export function readTikTokProfileVideo(inner, handle = '') {
  const img = String(inner || '').match(/<img\b[^>]*>/i)?.[0] || '';
  const alt = decode(img.match(/\balt="([^"]*)"/i)?.[1] || '');
  const cover = decode(img.match(/\bsrc="([^"]*)"/i)?.[1] || '');
  const views = decode(String(inner || '').match(/data-e2e="video-views"[^>]*>([^<]*)</i)?.[1] || '').trim();
  return {
    title: alt.replace(/\s+created by\s+.*$/i, '').trim(),
    cover,
    views,
  };
}

/** The profile header and its cards from one TikTok profile page. */
export function readTikTokProfile(html) {
  const data = embedded(html);
  const scope = data?.__DEFAULT_SCOPE__;
  const detail = scope?.['webapp.user-detail'];
  const info = detail?.userInfo;
  const user = info?.user;
  if (!user?.uniqueId) return null;
  const stats = info?.statsV2 || info?.stats || {};
  const handle = String(user.uniqueId).replace(/^@/, '');
  const videos = [];
  const seen = new Set();
  const anchors = String(html).matchAll(/<a\b[^>]*href="[^"]*\/video\/(\d{15,25})"[^>]*>([\s\S]*?)<\/a>/gi);
  for (const match of anchors) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const card = readTikTokProfileVideo(match[2], handle);
    videos.push({
      id,
      url: `https://www.tiktok.com/@${handle}/video/${id}`,
      title: card.title,
      cover: card.cover,
      views: card.views,
      createdAt: secondsFromId(id),
      likes: 0,
      comments: 0,
      shares: 0,
    });
  }
  return {
    user: {
      handle,
      name: decode(user.nickname || handle),
      avatar: decode(user.avatarLarger || user.avatarMedium || user.avatarThumb || ''),
      verified: Boolean(user.verified),
      signature: decode(user.signature || ''),
      private: Boolean(user.privateAccount || user.secret),
      followers: count(stats.followerCount, info?.stats?.followerCount),
      following: count(stats.followingCount, info?.stats?.followingCount),
      likes: count(stats.heartCount, stats.heart, info?.stats?.heartCount, info?.stats?.heart),
      videos: count(stats.videoCount, info?.stats?.videoCount),
    },
    videos,
  };
}

/** Views, likes, comments and shares from one TikTok video page. */
export function readTikTokVideo(html) {
  const data = embedded(html);
  const item = data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
  if (!item?.id) return null;
  const stats = item.stats || {};
  return {
    id: String(item.id),
    title: decode(item.desc || '').trim(),
    cover: decode(item.video?.cover || ''),
    createdAt: Number(item.createTime) || secondsFromId(String(item.id)),
    views: Number(stats.playCount) || 0,
    likes: Number(stats.diggCount) || 0,
    comments: Number(stats.commentCount) || 0,
    shares: Number(stats.shareCount) || 0,
  };
}

/**
 * TikTok's account embed carries the same public header plus ten recent videos with covers,
 * titles and view counts. It is more reliable than the full profile page, which sometimes
 * leaves out the video cards for a logged-out reader.
 */
export function readTikTokEmbed(html) {
  const found = String(html || '').match(/<script[^>]+id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!found) return null;
  let data;
  try { data = JSON.parse(found[1]); } catch { return null; }
  const pages = data?.source?.data;
  const page = pages && typeof pages === 'object'
    ? Object.values(pages).find((entry) => entry?.userInfo?.uniqueId)
    : null;
  const info = page?.userInfo;
  if (!info?.uniqueId) return null;
  const handle = String(info.uniqueId).replace(/^@/, '');
  const seen = new Set();
  const videos = [];
  for (const item of Array.isArray(page.videoList) ? page.videoList : []) {
    const id = String(item?.id || '');
    if (item?.privateItem || !/^\d{15,25}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    videos.push({
      id,
      url: `https://www.tiktok.com/@${handle}/video/${id}`,
      title: decode(item.desc || '').trim(),
      cover: decode(item.coverUrl || item.originCoverUrl || ''),
      views: shortTikTokCount(item.playCount),
      createdAt: secondsFromId(id),
      likes: 0,
      comments: 0,
      shares: 0,
    });
  }
  return {
    user: {
      handle,
      name: decode(info.nickname || handle),
      avatar: decode(info.avatarThumbUrl || ''),
      verified: Boolean(info.verified),
      signature: decode(info.signature || ''),
      private: Boolean(info.privateAccount),
      followers: count(info.followerCount),
      following: count(info.followingCount),
      likes: count(info.heartCount),
      // The embed does not say how many videos the account has in total.
      videos: null,
    },
    videos,
  };
}

/** 1,253,393 -> 1.3M; 76300000 -> 76.3M. */
export function shortTikTokCount(value) {
  const number = Number(value) || 0;
  if (number >= 1000000) return `${(number / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(number);
}

const normalName = (raw) => String(raw || '').trim().replace(/^@/, '');
const nameOk = (name) => /^[\w.]{2,24}$/.test(name);

async function readerHtml(url, signal) {
  const timeout = AbortSignal.timeout?.(30000);
  const both = signal && timeout && AbortSignal.any ? AbortSignal.any([signal, timeout]) : signal || timeout;
  const response = await fetch(`${READER}${url}`, {
    headers: { 'X-Return-Format': 'html', Accept: 'text/html' },
    signal: both,
    cache: 'no-cache',
  });
  if (!response.ok) throw new Error(`TikTok reader answered ${response.status}.`);
  return response.text();
}

async function fetchProfile(name, signal) {
  // The profile page has the exact header and total video count; the embed is the reliable
  // list of recent videos. Asking for both costs one extra reader request and allows either
  // page to be missing without losing the tile.
  const [profilePage, embedPage] = await Promise.allSettled([
    readerHtml(`https://www.tiktok.com/@${encodeURIComponent(name)}?lang=en`, signal),
    readerHtml(`https://www.tiktok.com/embed/@${encodeURIComponent(name)}?lang=en-US`, signal),
  ]);
  const wanted = name.toLocaleLowerCase();
  let profile = profilePage.status === 'fulfilled' ? readTikTokProfile(profilePage.value) : null;
  let embed = embedPage.status === 'fulfilled' ? readTikTokEmbed(embedPage.value) : null;
  // Never show another account if TikTok redirects or serves a generic page.
  if (profile && profile.user.handle.toLocaleLowerCase() !== wanted) profile = null;
  if (embed && embed.user.handle.toLocaleLowerCase() !== wanted) embed = null;
  if (!profile && !embed) {
    if (profilePage.status === 'rejected' && embedPage.status === 'rejected') {
      throw new Error(profilePage.reason?.message || embedPage.reason?.message || "TikTok didn't return that profile.");
    }
    throw new Error("TikTok didn't return that profile.");
  }
  const base = embed?.user || {};
  const exact = profile?.user || {};
  const user = {
    handle: exact.handle || base.handle,
    name: exact.name || base.name,
    avatar: exact.avatar || base.avatar,
    verified: Boolean(exact.verified ?? base.verified),
    signature: exact.signature || base.signature,
    private: Boolean(exact.private ?? base.private),
    followers: exact.followers ?? base.followers ?? 0,
    following: exact.following ?? base.following ?? 0,
    likes: exact.likes ?? base.likes ?? 0,
    videos: exact.videos ?? base.videos ?? null,
  };
  const listed = embed?.videos?.length ? embed.videos : profile?.videos ?? [];
  if (user.private || !listed.length) return { user, videos: listed };
  const newest = listed.slice(0, VIDEO_LIMIT);
  const extra = await Promise.all(newest.map(async (video) => {
    try {
      const page = await readerHtml(video.url, signal);
      return readTikTokVideo(page);
    } catch {
      return null;
    }
  }));
  const byId = new Map(extra.filter(Boolean).map((video) => [video.id, video]));
  return {
    user,
    videos: listed.map((video) => {
      const stats = byId.get(video.id);
      return stats ? {
        ...video,
        title: stats.title || video.title,
        cover: stats.cover || video.cover,
        views: stats.views ? shortTikTokCount(stats.views) : video.views,
        likes: stats.likes,
        comments: stats.comments,
        shares: stats.shares,
      } : video;
    }),
  };
}

/** A profile with up to ten enriched videos. Cached ten minutes; ten video pages per refresh. */
export function loadTikTokProfile(raw, { force = false, signal } = {}) {
  const name = normalName(raw);
  if (!nameOk(name)) return Promise.reject(new Error("That isn't a TikTok username."));
  const key = name.toLocaleLowerCase();
  const known = profileCache.get(key);
  if (!force && known && Date.now() - known.at < PROFILE_TTL) return Promise.resolve(known.data);
  if (profileInflight.has(key)) return profileInflight.get(key);
  const ask = fetchProfile(name, signal)
    .then((data) => {
      profileCache.set(key, { at: Date.now(), data });
      return data;
    })
    .finally(() => profileInflight.delete(key));
  profileInflight.set(key, ask);
  return ask;
}
