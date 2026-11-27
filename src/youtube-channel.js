// Public YouTube channel pages through the same r.jina.ai reader MULTIGRID already uses.
// The page's ytInitialData carries the header, videos, Shorts and playlists; nothing is
// framed, and each tab is cached for ten minutes. No key, account or server.

const READER = 'https://r.jina.ai/';
const TTL = 10 * 60 * 1000;
const cache = new Map();
const inflight = new Map();

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const textOf = (node) => clean(node?.content ?? node?.text ?? node?.simpleText
  ?? (Array.isArray(node?.runs) ? node.runs.map((run) => run.text || '').join('') : ''));
const largest = (sources) => [...(Array.isArray(sources) ? sources : [])]
  .filter((source) => source?.url)
  .sort((a, b) => (Number(b.width) || 0) * (Number(b.height) || 0) - (Number(a.width) || 0) * (Number(a.height) || 0))[0]?.url || '';

function initialData(html) {
  const found = String(html || '').match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (!found) return null;
  try { return JSON.parse(found[1]); } catch { return null; }
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  for (const value of Object.values(node)) walk(value, visit);
}

const selectedTab = (data) => {
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
  return tabs.find((tab) => tab?.tabRenderer?.selected)?.tabRenderer
    ?? tabs.find((tab) => tab?.tabRenderer?.content)?.tabRenderer
    ?? null;
};

const channelTabs = (data) => {
  const titles = (data?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [])
    .map((tab) => clean(tab?.tabRenderer?.title))
    .filter(Boolean);
  const supported = titles.filter((title) => /^(videos|shorts|playlists|live)$/i.test(title));
  return supported.length ? supported : ['Videos'];
};

function headerFrom(data) {
  const page = data?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
  const meta = data?.metadata?.channelMetadataRenderer;
  if (!page && !meta) return null;
  const titleNode = page?.title?.dynamicTextViewModel;
  const parts = (page?.metadata?.contentMetadataViewModel?.metadataRows ?? [])
    .flatMap((row) => row?.metadataParts ?? []);
  const labels = parts.map((part) => textOf(part?.text)).filter(Boolean);
  const accessibility = titleNode?.rendererContext?.accessibilityContext?.label || '';
  const id = clean(meta?.externalId) || clean(page?.attribution?.attributionViewModel?.attribution?.content);
  const handle = labels.find((line) => line.startsWith('@'))
    || clean(meta?.vanityChannelUrl).match(/@[\w.-]+/)?.[0]
    || '';
  const name = textOf(titleNode?.text) || clean(meta?.title);
  if (!name) return null;
  return {
    id,
    name,
    handle: handle.replace(/^@/, ''),
    avatar: largest(page?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources)
      || largest(meta?.avatar?.thumbnails),
    banner: largest(page?.banner?.imageBannerViewModel?.image?.sources)
      || largest(meta?.banner?.thumbnails),
    verified: /verified/i.test(accessibility)
      || Boolean(titleNode?.text?.attachmentRuns?.length),
    subscribers: labels.find((line) => /subscriber/i.test(line)) || '',
    videos: labels.find((line) => /video/i.test(line)) || '',
    description: textOf(page?.description?.descriptionPreviewViewModel?.description)
      || clean(meta?.description),
    tabs: channelTabs(data),
  };
}

const badgeTexts = (node) => {
  const out = [];
  walk(node, (value) => {
    if (value?.thumbnailBadgeViewModel?.text) out.push(clean(value.thumbnailBadgeViewModel.text));
    if (value?.metadataBadgeViewModel?.text) out.push(clean(value.metadataBadgeViewModel.text));
  });
  return out;
};

const isLiveNode = (node) => badgeTexts(node).some((text) => /^live$/i.test(text))
  || Boolean(node?.isLiveNow)
  || Boolean(node?.videoRenderer?.isLiveNow);

function partsOf(lockup) {
  return (lockup?.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows ?? [])
    .flatMap((row) => row?.metadataParts ?? []);
}

const viewText = (part) => {
  const shown = textOf(part?.text);
  if (!shown) return '';
  if (/view/i.test(shown) || /watching/i.test(shown)) return shown;
  return /view/i.test(part?.accessibilityLabel || '') ? `${shown} views` : '';
};

const publishedText = (part) => {
  const shown = textOf(part?.text);
  return /(ago|hour|day|week|month|year|minute)/i.test(`${shown} ${part?.accessibilityLabel || ''}`) ? shown : '';
};

function lockupVideo(lockup) {
  if (!lockup || lockup.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return null;
  const id = clean(lockup.contentId);
  if (!/^[\w-]{6,}$/.test(id)) return null;
  const parts = partsOf(lockup);
  const duration = badgeTexts(lockup).find((text) => /^\d+(:\d+)+$/.test(text)) || '';
  const live = isLiveNode(lockup);
  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: textOf(lockup.metadata?.lockupMetadataViewModel?.title),
    cover: largest(lockup.contentImage?.thumbnailViewModel?.image?.sources),
    duration,
    views: parts.map(viewText).find(Boolean) || '',
    published: parts.map(publishedText).find(Boolean) || '',
    live,
  };
}

function legacyVideo(video) {
  const id = clean(video?.videoId);
  if (!/^[\w-]{6,}$/.test(id)) return null;
  const parts = [
    { text: video.viewCountText, accessibilityLabel: video.viewCountText?.simpleText || '' },
    { text: video.publishedTimeText, accessibilityLabel: video.publishedTimeText?.simpleText || '' },
  ];
  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: textOf(video.title),
    cover: largest(video.thumbnail?.thumbnails),
    duration: textOf(video.lengthText),
    views: parts.map(viewText).find(Boolean) || '',
    published: textOf(video.publishedTimeText),
    live: isLiveNode(video),
  };
}

export function readYouTubeVideos(html) {
  const data = initialData(html);
  if (!data) return null;
  const tab = selectedTab(data);
  const videos = [];
  const seen = new Set();
  const add = (video) => {
    if (!video || seen.has(video.id)) return;
    seen.add(video.id);
    videos.push(video);
  };
  walk(tab?.content, (node) => {
    if (node?.lockupViewModel) add(lockupVideo(node.lockupViewModel));
    if (node?.videoRenderer) add(legacyVideo(node.videoRenderer));
  });
  return videos;
}

export function readYouTubeShorts(html) {
  const data = initialData(html);
  if (!data) return null;
  const tab = selectedTab(data);
  const shorts = [];
  const seen = new Set();
  const add = (item) => {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    shorts.push(item);
  };
  walk(tab?.content, (node) => {
    if (node?.shortsLockupViewModel) {
      const short = node.shortsLockupViewModel;
      const id = clean(short.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId)
        || clean(short.entityId).replace(/^shorts-shelf-item-/, '');
      add({
        id,
        url: `https://www.youtube.com/shorts/${id}`,
        title: textOf(short.overlayMetadata?.primaryText)
          || clean(short.accessibilityText).replace(/,\s*[\d.,KMB]+\s+views?.*$/i, ''),
        cover: largest(short.thumbnailViewModel?.image?.sources)
          || largest(short.onTap?.innertubeCommand?.reelWatchEndpoint?.thumbnail?.thumbnails),
        views: textOf(short.overlayMetadata?.secondaryText),
      });
    }
    if (node?.reelItemRenderer) {
      const short = node.reelItemRenderer;
      const id = clean(short.videoId);
      add({
        id,
        url: `https://www.youtube.com/shorts/${id}`,
        title: textOf(short.headline),
        cover: largest(short.thumbnail?.thumbnails),
        views: textOf(short.viewCountText),
      });
    }
  });
  return shorts;
}

export function readYouTubePlaylists(html) {
  const data = initialData(html);
  if (!data) return null;
  const tab = selectedTab(data);
  const playlists = [];
  const seen = new Set();
  walk(tab?.content, (node) => {
    const lockup = node?.lockupViewModel;
    if (lockup?.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST') {
      const id = clean(lockup.contentId);
      if (!/^[\w-]{6,}$/.test(id) || seen.has(id)) return;
      seen.add(id);
      playlists.push({
        id,
        url: `https://www.youtube.com/playlist?list=${id}`,
        title: textOf(lockup.metadata?.lockupMetadataViewModel?.title),
        cover: largest(lockup.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources),
        count: badgeTexts(lockup).find((text) => /videos?/i.test(text)) || '',
      });
    }
    const legacy = node?.gridPlaylistRenderer;
    if (legacy?.playlistId && !seen.has(legacy.playlistId)) {
      seen.add(legacy.playlistId);
      playlists.push({
        id: legacy.playlistId,
        url: `https://www.youtube.com/playlist?list=${legacy.playlistId}`,
        title: textOf(legacy.title),
        cover: largest(legacy.thumbnail?.thumbnails),
        count: textOf(legacy.videoCountText),
      });
    }
  });
  return playlists;
}

/** A public playlist page's title and tracks, for the music player. */
export function readYouTubePlaylist(html) {
  const data = initialData(html);
  if (!data) return null;
  let title = '';
  const tracks = [];
  const seen = new Set();
  walk(data, (node) => {
    const header = node?.playlistHeaderRenderer || node?.playlistMetadataRenderer;
    if (!title && header) title = textOf(header.title);
    const lockup = node?.lockupViewModel;
    if (lockup?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
      const id = clean(lockup.contentId);
      if (!id || seen.has(id)) return;
      seen.add(id);
      tracks.push({
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: textOf(lockup.metadata?.lockupMetadataViewModel?.title) || id,
        length: badgeTexts(lockup).find((text) => /^\d+:\d{2}(?::\d{2})?$/.test(text)) || '',
        cover: largest(lockup.contentImage?.thumbnailViewModel?.image?.sources)
          || largest(lockup.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources),
        index: tracks.length + 1,
      });
      return;
    }
    const item = node?.playlistVideoRenderer;
    if (!item?.videoId || seen.has(item.videoId)) return;
    seen.add(item.videoId);
    tracks.push({
      id: item.videoId,
      url: `https://www.youtube.com/watch?v=${item.videoId}`,
      title: textOf(item.title) || item.videoId,
      length: textOf(item.lengthText),
      cover: largest(item.thumbnail?.thumbnails),
      index: Number(textOf(item.index)) || tracks.length + 1,
    });
  });
  if (!tracks.length) return null;
  tracks.sort((a, b) => a.index - b.index);
  return { title, tracks };
}

/* YouTube Music puts its page data in escaped JSON strings rather than the plain
   ytInitialData the main site uses. These decode one JS string literal. */
function unescapeJsString(raw) {
  return String(raw || '').replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[\s\S])/g, (whole, escape) => {
    if (escape[0] === 'x' || escape[0] === 'X') return String.fromCharCode(parseInt(escape.slice(1), 16));
    if (escape[0] === 'u' || escape[0] === 'U') return String.fromCharCode(parseInt(escape.slice(1), 16));
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' })[escape] ?? escape;
  });
}

const decodeXml = (value) => String(value ?? '')
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&(amp|quot|apos|lt|gt);/gi, (_, name) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' })[name.toLowerCase()]);

/** A YouTube Music album page's tracks, from its escaped page data. */
export function readYouTubeMusicPlaylist(html) {
  const text = String(html || '');
  const pushes = /initialData\.push\(\{\s*path:\s*'([^']*)'[\s\S]*?data:\s*'((?:[^'\\]|\\.)*)'\s*\}\)/g;
  for (const match of text.matchAll(pushes)) {
    let data;
    try { data = JSON.parse(unescapeJsString(match[2])); } catch { continue; }
    const shelves = [];
    walk(data, (node) => {
      const shelf = node?.musicShelfRenderer;
      if (shelf?.contents?.some((item) => item?.musicResponsiveListItemRenderer)) shelves.push(shelf);
    });
    const shelf = shelves.sort((a, b) => (b.contents?.length || 0) - (a.contents?.length || 0))[0];
    if (!shelf) continue;
    const tracks = [];
    const seen = new Set();
    for (const node of shelf.contents || []) {
      const item = node?.musicResponsiveListItemRenderer;
      if (!item) continue;
      const id = clean(item.playlistItemData?.videoId)
        || clean(item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId);
      if (!/^[\w-]{6,}$/.test(id) || seen.has(id)) continue;
      seen.add(id);
      const title = textOf(item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text) || id;
      tracks.push({
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title,
        length: textOf(item.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text),
        cover: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        index: Number(textOf(item.index)) || tracks.length + 1,
      });
    }
    if (!tracks.length) continue;
    tracks.sort((a, b) => a.index - b.index);
    tracks.forEach((track, index) => { track.index = index + 1; });
    const info = data?.microformat?.microformatDataRenderer;
    return {
      title: clean(info?.title),
      poster: largest(info?.thumbnail?.thumbnails),
      tracks,
    };
  }
  return null;
}

/** A playlist's public RSS feed: its newest 15 videos, in playlist order. */
export function readYouTubeFeed(xml) {
  const text = String(xml || '');
  if (!/<feed\b/i.test(text)) return null;
  const feedTitle = clean(decodeXml(text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''));
  const tracks = [];
  const seen = new Set();
  for (const found of text.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
    const entry = found[0];
    const id = clean(entry.match(/<yt:videoId>\s*([\w-]{6,})\s*<\/yt:videoId>/i)?.[1]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const title = clean(decodeXml(entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')) || id;
    const cover = decodeXml(entry.match(/<media:thumbnail\b[^>]*\burl="([^"]*)"/i)?.[1] || '');
    tracks.push({
      id,
      url: `https://www.youtube.com/watch?v=${id}`,
      title,
      length: '',
      cover,
      index: tracks.length + 1,
    });
  }
  return tracks.length ? { title: feedTitle, tracks } : null;
}

const playlistSignal = (signal, milliseconds) => {
  const timeout = AbortSignal.timeout?.(milliseconds);
  return signal && timeout && AbortSignal.any ? AbortSignal.any([signal, timeout]) : signal || timeout;
};

async function readPlaylistPage(list, signal) {
  const page = /^OLAK/i.test(list)
    ? `https://music.youtube.com/playlist?list=${list}`
    : `https://www.youtube.com/playlist?list=${list}`;
  const response = await fetch(`${READER}${page}`, {
    headers: { 'X-Return-Format': 'html', Accept: 'text/html' },
    signal: playlistSignal(signal, 25000),
    cache: 'no-cache',
  });
  if (!response.ok) throw new Error(`YouTube reader answered ${response.status}.`);
  const html = await response.text();
  const data = readYouTubeMusicPlaylist(html) || readYouTubePlaylist(html);
  if (!data) throw new Error("YouTube didn't return that playlist.");
  return data;
}

async function readPlaylistFeed(list, signal) {
  const response = await fetch(`${READER}https://www.youtube.com/feeds/videos.xml?playlist_id=${list}`, {
    headers: { 'X-Return-Format': 'html', Accept: 'text/xml, application/xml, text/plain' },
    signal: playlistSignal(signal, 15000),
    cache: 'no-cache',
  });
  if (!response.ok) throw new Error(`YouTube reader answered ${response.status}.`);
  const data = readYouTubeFeed(await response.text());
  if (!data) throw new Error("YouTube didn't return that playlist.");
  return data;
}

/** A playlist's track list, cached ten minutes. The caller supplies a list ID or URL. */
export function loadYouTubePlaylist(raw, { force = false, signal } = {}) {
  const text = String(raw || '').trim();
  const list = text.match(/[?&]list=([\w-]{6,})/)?.[1] || text;
  if (!/^[\w-]{6,}$/.test(list)) return Promise.reject(new Error("That isn't a YouTube playlist."));
  const key = `playlist:${list}`;
  const known = cache.get(key);
  if (!force && known && Date.now() - known.at < TTL) return Promise.resolve(known.data);
  if (inflight.has(key)) return inflight.get(key);
  const ask = (async () => {
    let data;
    try {
      data = await readPlaylistPage(list, signal);
    } catch (error) {
      // Big playlist pages are sometimes the thing YouTube's reader trips on. The small
      // RSS feed still gives the songs (the newest 15), so the album is never a dead end.
      try { data = await readPlaylistFeed(list, signal); } catch { throw error; }
    }
    const answer = { id: list, ...data };
    cache.set(key, { at: Date.now(), data: answer });
    return answer;
  })().finally(() => inflight.delete(key));
  inflight.set(key, ask);
  return ask;
}

/** One channel page: header, its tabs, and the requested tab's items. */
export function readYouTubeChannel(html, tab = 'videos') {
  const data = initialData(html);
  if (!data) return null;
  const header = headerFrom(data);
  if (!header) return null;
  const key = String(tab).toLowerCase();
  return {
    header,
    tab: key,
    videos: key === 'videos' ? readYouTubeVideos(html) ?? [] : [],
    shorts: key === 'shorts' ? readYouTubeShorts(html) ?? [] : [],
    playlists: key === 'playlists' ? readYouTubePlaylists(html) ?? [] : [],
  };
}

const normalId = (raw) => String(raw || '').trim().replace(/^@/, '');
const idOk = (id) => /^UC[\w-]{22}$/.test(id);

async function fetchChannel(id, tab, signal) {
  const path = tab === 'shorts' ? 'shorts' : tab === 'playlists' ? 'playlists' : 'videos';
  const timeout = AbortSignal.timeout?.(45000);
  const both = signal && timeout && AbortSignal.any ? AbortSignal.any([signal, timeout]) : signal || timeout;
  const response = await fetch(`${READER}https://www.youtube.com/channel/${id}/${path}`, {
    headers: { 'X-Return-Format': 'html', Accept: 'text/html' },
    signal: both,
    cache: 'no-cache',
  });
  if (!response.ok) throw new Error(`YouTube reader answered ${response.status}.`);
  const data = readYouTubeChannel(await response.text(), tab);
  if (!data) throw new Error("YouTube didn't return that channel.");
  return data;
}

/** A channel tab, cached ten minutes. `tab` is 'videos', 'shorts' or 'playlists'. */
export function loadYouTubeChannel(raw, { tab = 'videos', force = false, signal } = {}) {
  const id = normalId(raw);
  if (!idOk(id)) return Promise.reject(new Error("That isn't a YouTube channel ID."));
  const key = `${id}:${tab}`;
  const known = cache.get(key);
  if (!force && known && Date.now() - known.at < TTL) return Promise.resolve(known.data);
  if (inflight.has(key)) return inflight.get(key);
  const ask = fetchChannel(id, tab, signal)
    .then((data) => {
      cache.set(key, { at: Date.now(), data });
      return data;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, ask);
  return ask;
}
