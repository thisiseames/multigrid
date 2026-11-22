// Player rendering: one small player per kind of source, all with the same shape.
//
//   el        the element to put in the tile
//   start()   begins playback; called once `el` is in the page
//   canMute   whether this player's sound can be controlled from here
//   setMuted  changes the sound
//   canVolume whether its level can be changed too
//   setVolume changes the level, 0 to 100
//   destroy() stops everything
//
// Problems are reported through onError(message). Only a parsed source's address is ever
// used: nothing pasted by the user reaches the page as HTML.

import { chooseAgain, findFile, reopen } from './local-files.js';
import { buildEmbedUrl, isBlockedMixedContent } from './sources.js';
import { parseXProfile, parseXProfileHtml, parseXVideoPage, xPostedAt } from './x-feed.js';
import { el, icon, iconButton } from './ui.js';
import { ago, hasKey, itemById, loadIndex, openStory, safeFragment, sourceColor } from './reader.js';
import { runBoxScore } from './boxscore.js';
import { DONE_AT, forgetPlace, isPlayed, notePlace, placeOf, rememberMedia, resumePoint, showResumed } from './resume.js';

const scripts = new Map();

function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => {
        scripts.delete(src);
        reject(new Error(`Could not load ${src}`));
      };
      document.head.append(script);
    }));
  }
  return scripts.get(src);
}

function makeFrame(src) {
  const frame = document.createElement('iframe');
  frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.title = 'Video player';
  frame.src = src;
  return frame;
}

// iPhones leave the level to the phone's own buttons, and setting it does nothing.
const levelWorks = (() => {
  const probe = document.createElement('audio');
  probe.volume = 0.5;
  return probe.volume === 0.5;
})();

/** A finger-driven screen, where Safari draws its own big "unmute" button over a muted video. */
const touchScreen = () => Boolean(window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);

/** The MULTIGRID Sound extension says it's here. It can reach a player inside any embed. */
const hasSoundExtension = () => document.documentElement.dataset.multigridSound === '1';
/** Version 1.2 of the extension can also pause and play players inside embeds. */
const extensionCanPause = () => document.documentElement.dataset.multigridPause === '1';
/** Version 1.3 can also jump back and forward inside embeds. */
const extensionCanSeek = () => document.documentElement.dataset.multigridSeek === '1';

function extensionSound(frame, muted, volume) {
  const wanted = { muted, volume };
  const send = () => frame.contentWindow?.postMessage({ multigridSound: { muted: wanted.muted, volume: wanted.volume / 100 } }, '*');
  const onMessage = (event) => {
    if (event.source === frame.contentWindow && event.data?.multigridSoundAsk) send();
  };
  return {
    start() {
      window.addEventListener('message', onMessage);
      frame.addEventListener('load', send);
      // A browser may hold back sound until the first click on the page.
      window.addEventListener('pointerdown', send, { once: true });
    },
    setMuted(next) {
      wanted.muted = next;
      send();
    },
    setVolume(next) {
      wanted.volume = next;
      send();
    },
    setPaused(next) {
      frame.contentWindow?.postMessage({ multigridPlay: { paused: Boolean(next) } }, '*');
    },
    seekBy(seconds) {
      frame.contentWindow?.postMessage({ multigridSeek: { by: seconds } }, '*');
    },
    stop() {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('pointerdown', send);
    },
  };
}

/* Version 1.4 of the extension remembers where you stopped inside an embed (a series
   episode) and jumps back there itself. It tells MULTIGRID, which shows the usual note. The
   message comes from the player's frame, often nested deeper, so the tile is found by
   walking up from it to one of MULTIGRID's own frames. */
function tileFrameOf(source) {
  let node = source;
  for (let depth = 0; node && depth < 8; depth += 1) {
    const match = [...document.querySelectorAll('iframe')].find((frame) => frame.contentWindow === node);
    if (match) return match;
    if (node.parent === node) return null;
    node = node.parent;
  }
  return null;
}
// Embeds that report progress (extension 1.5), with what each tile is, for Continue watching.
const embedTiles = new Map(); // frame -> describe()
window.addEventListener('message', (event) => {
  const progress = event.data?.multigridProgress;
  if (!progress || !Number.isFinite(progress.at) || !Number.isFinite(progress.length)) return;
  const frame = tileFrameOf(event.source);
  const describe = frame && embedTiles.get(frame);
  const tile = describe?.();
  if (!tile?.input) return;
  // The extension itself jumps back to the place; this only lists it. A series that moved on
  // keeps one card, which opens the episode it's on.
  notePlace(`embed:${tile.input}`, progress.at, progress.length, { input: tile.input, page: tile.page || '', name: tile.name, from: '' });
});
// Extension 1.6 says where a tile's own page is now, such as a series' next episode.
const pageTiles = new Map(); // frame -> onPage(href)
window.addEventListener('message', (event) => {
  const href = event.data?.multigridPage?.href;
  if (typeof href !== 'string' || !event.source) return;
  // Only a tile's own page, not anything inside it.
  const frame = [...pageTiles.keys()].find((item) => item.contentWindow === event.source);
  if (frame) pageTiles.get(frame)(href);
});
window.addEventListener('message', (event) => {
  const resumed = event.data?.multigridResumed;
  if (!resumed || !Number.isFinite(resumed.at)) return;
  const frame = tileFrameOf(event.source);
  if (!frame) return;
  showResumed(frame.parentElement, resumed.at, () => frame.contentWindow?.postMessage({ multigridStartOver: true }, '*'));
});

/** Players whose only sound control is their address: changing it reloads the player. */
function addressMutedPlayer(source, options) {
  const { muted, volume, autoplay, env } = options;
  const frame = makeFrame(buildEmbedUrl(source, { muted, autoplay }, env));
  const extension = hasSoundExtension() ? extensionSound(frame, muted, volume) : null;
  return {
    el: frame,
    canMute: true,
    canVolume: Boolean(extension) && levelWorks,
    canPause: Boolean(extension) && extensionCanPause(),
    setPaused(next) { extension?.setPaused(next); },
    canSeek: Boolean(extension) && extensionCanSeek(),
    seekBy(seconds) { extension?.seekBy(seconds); },
    start() {
      extension?.start();
    },
    setMuted(next) {
      if (extension) extension.setMuted(next);
      else frame.src = buildEmbedUrl(source, { muted: next, autoplay: true }, env);
    },
    setVolume(next) {
      extension?.setVolume(next);
    },
    destroy() {
      extension?.stop();
      embedTiles.delete(frame);
      frame.removeAttribute('src');
    },
  };
}

const YOUTUBE_ERRORS = {
  2: "YouTube says this video's link isn't valid.",
  5: "This video can't play in this browser.",
  100: 'This video is private, removed or not found.',
  // YouTube also sends these two for a video that doesn't exist and for its bot check.
  101: "YouTube won't play this here. Its owner may not allow other sites, the video may not exist, or YouTube may want you to sign in first.",
  150: "YouTube won't play this here. Its owner may not allow other sites, the video may not exist, or YouTube may want you to sign in first.",
  152: "YouTube won't play this video on other sites.",
  153: 'YouTube needs to know which site this is, and your browser hid that. A privacy setting or extension may be the cause.',
};

/* YouTube's player can't always load a channel's uploads list on its own. In about three
   browser sessions in ten it shows "Video unavailable", and reloading doesn't help. Starting
   from the newest video, with the list behind it, plays every time. YouTube's oEmbed answer
   for the list names that video in its thumbnail, and it's allowed to be read from here. */
const newestCache = new Map();

export function newestUpload(list) {
  const cached = newestCache.get(list);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return Promise.resolve(cached.id);
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/playlist?list=${list}`)}`;
  return fetch(url, { signal: AbortSignal.timeout?.(4000) })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const id = String(data?.thumbnail_url ?? '').match(/\/vi(?:_webp)?\/([\w-]{11})\//)?.[1] ?? null;
      if (id) newestCache.set(list, { id, at: Date.now() });
      return id;
    })
    .catch(() => null);
}

function youtubePlayer(source, options) {
  const { muted, volume, autoplay, env, onError, onCapability, onPlayState } = options;
  const { id, list, channel } = source.youtube;
  const isUploads = Boolean(list?.startsWith('UU') && !id && !channel);
  const frame = makeFrame(isUploads ? 'about:blank' : buildEmbedUrl(source, { muted, autoplay }, env));
  let api = null;
  let wanted = muted;
  let level = volume;
  let destroyed = false;

  // A channel or playlist gets Back, Next and where it is, like a TikTok feed. They show once
  // YouTube has loaded the list, because until then there's nothing to move through.
  const counter = el('span', { class: 'feed-count', textContent: '' });
  const listButtons = list ? [
    iconButton('back', 'Previous video', () => api?.previousVideo()),
    counter,
    iconButton('next', 'Next video', () => api?.nextVideo()),
  ] : null;
  const playlist = () => (api?.getPlaylist?.() ?? null);
  const showPlace = () => {
    if (!listButtons) return;
    const items = playlist();
    const known = Boolean(items?.length > 1);
    for (const node of listButtons) node.hidden = !known;
    if (known) counter.textContent = `${Math.max(0, api.getPlaylistIndex()) + 1}/${items.length}`;
  };
  listButtons?.forEach((node) => { node.hidden = true; });

  // Long videos remember where you stopped, and start there next time.
  const checked = new Set();
  let keeper = null;
  const videoKey = () => {
    const data = api?.getVideoData?.();
    return data?.video_id && !data.isLive ? `yt:${data.video_id}` : '';
  };
  const keepPlace = () => {
    const key = videoKey();
    if (!key) return;
    // Continue watching opens the video itself, even when the tile is a channel.
    const data = api.getVideoData?.();
    const tile = options.describe?.() || {};
    notePlace(key, api.getCurrentTime?.(), api.getDuration?.(), {
      input: `https://www.youtube.com/watch?v=${data.video_id}`,
      name: data.title || tile.name || 'YouTube video',
      from: data.author || tile.name || '',
    });
  };
  const maybeResume = () => {
    const key = videoKey();
    if (!key || checked.has(key)) return;
    checked.add(key);
    const point = resumePoint(key);
    const length = api.getDuration?.() || 0;
    if (!point || (length && point >= length * DONE_AT)) return;
    api.seekTo(point, true);
    showResumed(frame.parentElement, point, () => { api?.seekTo(0, true); forgetPlace(key); });
  };

  const self = {
    el: frame,
    canMute: true,
    canVolume: levelWorks,
    // Where the video is, and a link to that exact video, for "Send to phone".
    place() {
      const key = videoKey();
      if (!key) return null;
      const data = api.getVideoData?.();
      return { key, at: Math.floor(api.getCurrentTime?.() || 0), length: Math.round(api.getDuration?.() || 0), input: `https://www.youtube.com/watch?v=${data.video_id}`, name: data.title || '' };
    },
    canPause: true,
    setPaused(next) {
      if (!api) return;
      if (next) api.pauseVideo(); else api.playVideo();
    },
    canSeek: true,
    seekBy(seconds) {
      if (!api?.getCurrentTime) return;
      api.seekTo(Math.max(0, api.getCurrentTime() + seconds), true);
    },
    stripButtons: listButtons,
    async start() {
      if (isUploads) {
        // The channel's videos-only list leaves Shorts out. A channel with nothing but Shorts
        // has no such list, so it plays everything. If both lookups fail, the plain address is
        // still worth a try.
        const videosOnly = `UULF${list.slice(2)}`;
        let chosen = videosOnly;
        let newest = await newestUpload(videosOnly);
        if (!newest) {
          chosen = list;
          newest = await newestUpload(list);
        }
        if (destroyed) return;
        const youtube = newest ? { ...source.youtube, id: newest, list: chosen } : source.youtube;
        frame.src = buildEmbedUrl({ ...source, youtube }, { muted: wanted, autoplay }, env);
      }
      window.YT = window.YT || {};
      const ready = new Promise((resolve) => {
        if (window.YT.Player) return resolve();
        const previous = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          previous?.();
          resolve();
        };
        return undefined;
      });
      loadScript('https://www.youtube.com/iframe_api').then(() => ready).then(() => {
        if (destroyed) return;
        const player = new window.YT.Player(frame, {
          events: {
            onReady() {
              api = player;
              api.setVolume(level);
              if (wanted) api.mute(); else api.unMute();
              showPlace();
              maybeResume();
              clearInterval(keeper);
              keeper = setInterval(() => { if (api?.getPlayerState?.() === 1) keepPlace(); }, 10000);
            },
            onStateChange(event) {
              showPlace();
              if (event.data === 1) onPlayState?.(false);
              if (event.data === 2) onPlayState?.(true);
              if (event.data === 1) maybeResume();
              if (event.data === 2 || event.data === 0) keepPlace();
            },
            onError(event) {
              // One video in a list that won't play here shouldn't stop the whole tile.
              const items = playlist();
              if (items?.length > 1 && api.getPlaylistIndex() < items.length - 1) {
                api.nextVideo();
                return;
              }
              onError(YOUTUBE_ERRORS[event.data] || `YouTube couldn't play this (code ${event.data}).`);
            },
          },
        });
      }).catch(() => {
        // The video still plays; only our button goes, because it couldn't do anything.
        self.canMute = false;
        self.canVolume = false;
        onCapability();
      });
    },
    setMuted(next) {
      wanted = next;
      if (!api) return;
      if (next) api.mute(); else api.unMute();
    },
    setVolume(next) {
      level = next;
      api?.setVolume(next);
    },
    destroy() {
      destroyed = true;
      clearInterval(keeper);
      try { keepPlace(); } catch { /* the player is already gone */ }
      frame.removeAttribute('src');
    },
  };
  return self;
}

let twitchEmbedCount = 0;

function twitchPlayer(source, options) {
  const { type, id, time } = source.twitch;
  // Clips aren't supported by Twitch's scripted player, so they use the plain address.
  if (type === 'clip') return addressMutedPlayer(source, { ...options, autoplay: options.autoplay });

  const { muted, volume, autoplay, env } = options;
  const holder = document.createElement('div');
  holder.className = 'player-fill';
  holder.id = `twitch-embed-${twitchEmbedCount++}`;
  let api = null;
  let fallback = null;
  let wanted = muted;
  let level = volume;
  let destroyed = false;
  let wasPlaying = false;
  return {
    el: holder,
    canMute: true,
    canVolume: levelWorks,
    canPause: true,
    setPaused(next) {
      if (!api) return;
      if (next) api.pause(); else api.play();
    },
    // A live channel only plays at the live edge; past broadcasts can be moved through.
    canSeek: type === 'video',
    seekBy(seconds) {
      if (!api?.getCurrentTime) return;
      api.seek(Math.max(0, api.getCurrentTime() + seconds));
    },
    // Twitch stops when covered, and doesn't start again by itself.
    rememberPlayback() {
      wasPlaying = api ? !api.isPaused() : autoplay;
    },
    resumePlayback() {
      if (!wasPlaying) return;
      // Twitch needs a moment to see that it's uncovered, so ask again if it didn't take.
      for (const delay of [300, 1200, 3000]) {
        setTimeout(() => {
          if (!destroyed && api?.isPaused()) api.play();
        }, delay);
      }
    },
    start() {
      loadScript('https://player.twitch.tv/js/embed/v1.js').then(() => {
        if (destroyed) return;
        const player = new window.Twitch.Player(holder.id, {
          width: '100%',
          height: '100%',
          [type]: type === 'video' ? `v${id}` : id,
          parent: [env.hostname],
          autoplay,
          muted,
          time: time ? `${time}s` : undefined,
        });
        player.addEventListener(window.Twitch.Player.READY, () => {
          api = player;
          if (wanted !== muted) api.setMuted(wanted);
          api.setVolume(level / 100);
        });
        // Twitch goes back to its own level after an ad, so ask again when the stream starts.
        player.addEventListener(window.Twitch.Player.PLAYING, () => api?.setVolume(level / 100));
        player.addEventListener(window.Twitch.Player.PLAY, () => options.onPlayState?.(false));
        player.addEventListener(window.Twitch.Player.PAUSE, () => options.onPlayState?.(true));
      }).catch(() => {
        if (destroyed) return;
        fallback = addressMutedPlayer(source, { ...options, muted: wanted, volume: level });
        holder.append(fallback.el);
      });
    },
    setMuted(next) {
      wanted = next;
      if (api) api.setMuted(next);
      else if (fallback) fallback.setMuted(next);
    },
    setVolume(next) {
      level = next;
      if (api) api.setVolume(next / 100);
      else fallback?.setVolume(next);
    },
    destroy() {
      destroyed = true;
      holder.replaceChildren();
    },
  };
}

function hlsPlayer(source, options) {
  const { muted, volume, autoplay, onError } = options;
  const video = document.createElement('video');
  // On a phone the browser's controls put a huge "unmute" button over a muted,
  // playing stream. MULTIGRID already has pause, mute and fullscreen for the
  // tuned stream, so leave the picture clean there.
  video.controls = !touchScreen();
  video.setAttribute('playsinline', '');
  video.volume = volume / 100;
  // Safari decides on autoplay from the attribute, not just the property.
  if (muted) video.setAttribute('muted', '');
  video.muted = muted;
  if (autoplay) {
    video.setAttribute('autoplay', '');
    // If the browser still holds back, the player's own play button remains.
    video.addEventListener('loadedmetadata', () => video.play().catch(() => {}), { once: true });
  }
  let hls = null;
  let destroyed = false;
  let recovered = false;
  // A recording with an end remembers where you stopped; a live channel never does.
  const keepPlace = rememberMedia(video, () => `link:${source.url}`, () => video.parentElement, () => options.describe?.());

  const networkMessage = (code) => {
    if (code === 404 || code === 410) return 'This stream was not found. It may have ended or moved.';
    if (code === 401 || code === 403) return "This stream's server refused access. The link may need a fresh token.";
    return "This stream didn't load. Its server may be offline, or it may not allow outside players.";
  };

  async function useHlsJs() {
    await loadScript('vendor/hls.min.js');
    if (destroyed) return;
    const { Hls } = window;
    if (!Hls.isSupported()) {
      onError("This browser can't play .m3u8 streams.");
      return;
    }
    hls = new Hls();
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
        recovered = true;
        hls.recoverMediaError();
        return;
      }
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) onError(networkMessage(data.response?.code));
      else onError("This stream couldn't be played. Its video format may not be supported in this browser.");
    });
    hls.loadSource(source.url);
    hls.attachMedia(video);
  }

  return {
    el: video,
    canMute: true,
    canVolume: levelWorks,
    place: () => keepPlace.place(),
    start() {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native playback gives no reason when it fails, so hls.js is asked as a second
        // opinion: it may play the stream, and if not, it can say what went wrong.
        video.addEventListener('error', () => {
          if (hls || destroyed) return;
          video.removeAttribute('src');
          useHlsJs().catch(() => onError("This stream didn't load."));
        });
        video.src = source.url;
      } else {
        useHlsJs().catch(() => onError("MULTIGRID's stream player didn't load. Check your connection and try again."));
      }
    },
    setMuted(next) {
      video.muted = next;
    },
    setVolume(next) {
      video.volume = next / 100;
    },
    destroy() {
      keepPlace();
      destroyed = true;
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    },
  };
}

const TIKTOK_ERRORS = {
  1001: "TikTok can't find this video. It may be private or removed.",
  2001: "TikTok's servers couldn't load this video. Try again in a moment.",
  3001: "This TikTok video couldn't play.",
};

/* A TikTok account plays as a feed: its latest videos, one after another, in TikTok's own
   player. Built-in lists come from feeds.json, which the GitHub job refreshes every 3 hours.
   An account that isn't in that list is looked up once in this browser and kept for six
   hours, so any public account can be added without changing the site. */
const FEEDS_TTL = 15 * 60 * 1000;
const ACCOUNT_TTL = 6 * 60 * 60 * 1000;
const ACCOUNT_KEY = 'multigrid.tiktok.accounts';
const FOLLOWING_KEY = 'multigrid.tiktok.following';
const FEED_READER = 'https://r.jina.ai/';
let feeds = null;
let feedsAt = 0;

function localAccounts() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

function writeLocalAccounts(list) {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(list));
    return true;
  } catch {
    // A browser that refuses storage still plays the list it just fetched.
    return false;
  }
}

function saveAccount(name, entry) {
  writeLocalAccounts({ ...localAccounts(), [name]: entry });
}

/** The following list imported from TikTok's data export, or an empty list. */
export function tiktokFollowing() {
  try {
    const saved = JSON.parse(localStorage.getItem(FOLLOWING_KEY) || 'null');
    return Array.isArray(saved?.names) ? saved.names.filter((name) => typeof name === 'string') : [];
  } catch {
    return [];
  }
}

/** Replaces the imported following list with a fresh export. */
export function saveTikTokFollowing(names) {
  try {
    localStorage.setItem(FOLLOWING_KEY, JSON.stringify({ at: Date.now(), names: [...new Set(names)] }));
    return true;
  } catch {
    return false;
  }
}

/** Adds accounts to the menu without fetching any videos yet. */
export function addTikTokAccounts(names) {
  const list = localAccounts();
  let changed = false;
  for (const name of names) {
    if (!list[name]) {
      list[name] = { title: '', videos: [], at: 0 };
      changed = true;
    }
  }
  return changed ? writeLocalAccounts(list) : true;
}

/** Takes accounts (and any videos remembered for them) back out of the menu. */
export function removeTikTokAccounts(names) {
  const list = localAccounts();
  let changed = false;
  for (const name of names) {
    if (list[name]) {
      delete list[name];
      changed = true;
    }
  }
  return changed ? writeLocalAccounts(list) : true;
}

/**
 * Every TikTok account this browser knows about, in one A–Z list: the ones added
 * here, then the built-in ones from feeds.json. Used by the tile's account switcher.
 */
export function tiktokAccounts() {
  const list = new Map();
  for (const [name, entry] of Object.entries(localAccounts())) {
    list.set(name, { name, title: entry?.title || '', videos: entry?.videos?.length || 0, local: true });
  }
  for (const [name, entry] of Object.entries(feeds?.tiktok || {})) {
    if (!list.has(name)) list.set(name, { name, title: entry?.title || '', videos: entry?.videos?.length || 0, local: false });
  }
  return [...list.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The second a TikTok video was posted sits in the top 32 bits of its number. */
function postedAt(id) {
  try { return Number(BigInt(id) >> 32n); } catch { return 0; }
}

function newestVideos(ids) {
  const now = Math.floor(Date.now() / 1000);
  return [...new Set(ids)]
    .map((id) => ({ id, at: postedAt(id) }))
    .filter(({ at }) => at > now - 30 * 86400 && at <= now + 3600)
    .sort((a, b) => b.at - a.at)
    .slice(0, 20)
    .map(({ id }) => id);
}

async function lookupAccount(name) {
  const response = await fetch(`${FEED_READER}https://www.tiktok.com/embed/@${encodeURIComponent(name)}?lang=en-US`, {
    cache: 'no-cache',
    signal: AbortSignal.timeout?.(20000),
  });
  if (!response.ok) throw new Error(`Lookup failed (${response.status})`);
  const text = await response.text();
  const ids = [...text.matchAll(/video\/(\d{15,25})/g)].map((match) => match[1]);
  const videos = newestVideos(ids);
  if (!videos.length) throw new Error('No recent videos found');
  return videos;
}

function loadFeeds() {
  if (feeds && Date.now() - feedsAt < FEEDS_TTL) return Promise.resolve(feeds);
  return fetch('feeds.json', { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const tiktok = { ...(data?.tiktok || {}) };
      for (const [name, entry] of Object.entries(localAccounts())) {
        if (entry?.videos?.length) tiktok[name] = entry;
      }
      if (Object.keys(tiktok).length) {
        feeds = { ...data, tiktok };
        feedsAt = Date.now();
      }
      return feeds;
    })
    .catch(() => feeds);
}

/** The built-in feed list, so the account menu can include it on a first open. */
export const loadTikTokFeeds = () => loadFeeds();

/** A feed for `name`, looked up now if this browser hasn't seen it recently. */
async function accountVideos(name) {
  const saved = localAccounts()[name];
  if (saved?.videos?.length && Date.now() - (saved.at || 0) < ACCOUNT_TTL) return saved.videos;
  const videos = await lookupAccount(name);
  saveAccount(name, { title: saved?.title || null, videos, at: Date.now() });
  return videos;
}

function tiktokFeedPlayer(source, options) {
  const { muted, volume, onError } = options;
  const profile = source.tiktok.profile.toLowerCase();
  const frame = makeFrame('about:blank');
  frame.className = 'frame-feed';
  const extension = hasSoundExtension() ? extensionSound(frame, muted, volume) : null;
  let videos = [];
  let index = 0;
  let wanted = muted;
  let ready = false;
  let playing = false;
  let advanced = false;
  let progressed = false;
  let destroyed = false;
  let feedPaused = false;
  let feedTime = 0;
  const send = (type) => frame.contentWindow?.postMessage({ type, 'x-tiktok-player': true }, '*');
  const show = (at) => {
    if (!videos.length || destroyed) return;
    index = (at + videos.length) % videos.length;
    ready = false;
    // Until the new video says it's ready, end signals still arriving from the last one don't count.
    advanced = true;
    progressed = false;
    const params = new URLSearchParams({ autoplay: '1', muted: wanted ? '1' : '0', loop: '0', rel: '0', native_context_menu: '0', closed_caption: '0' });
    frame.src = `https://www.tiktok.com/player/v1/${videos[index]}?${params}`;
    counter.textContent = `${index + 1}/${videos.length}`;
  };
  const next = () => {
    if (advanced) return;
    advanced = true;
    show(index + 1);
  };
  const onMessage = (event) => {
    if (event.source !== frame.contentWindow || !event.data?.['x-tiktok-player']) return;
    const { type, value } = event.data;
    if (type === 'onPlayerReady') {
      ready = true;
      advanced = false;
      send(wanted ? 'mute' : 'unMute');
      if (!feedPaused) send('play');
    } else if (type === 'onStateChange') {
      playing = value === 1 || value === 3;
      if (value === 1) options.onPlayState?.(false);
      if (value === 2) options.onPlayState?.(true);
      if (value === 0 && progressed) next();
    } else if (type === 'onCurrentTime') {
      feedTime = Number(value?.currentTime) || 0;
      // The ended signal doesn't always come, so the clock decides too, but only for a video
      // that really played. A phone that blocks autoplay mustn't race through the feed.
      const current = Number(value?.currentTime);
      const duration = Number(value?.duration);
      if (current >= 1) progressed = true;
      if (progressed && duration > 0 && current >= duration - 0.4) next();
    } else if (type === 'onPlayerError') {
      // A removed or private video moves the feed along. Blocked autoplay waits for a tap.
      if (TIKTOK_ERRORS[value?.errorCode]) setTimeout(next, 800);
    }
  };
  const counter = el('span', { class: 'feed-count', textContent: '' });
  const stripButtons = [
    iconButton('back', 'Previous video', () => show(index - 1)),
    counter,
    iconButton('next', 'Next video', () => show(index + 1)),
  ];
  return {
    el: frame,
    canMute: true,
    canVolume: Boolean(extension) && levelWorks,
    canPause: true,
    setPaused(next) {
      feedPaused = Boolean(next);
      if (ready) send(next ? 'pause' : 'play');
    },
    canSeek: true,
    seekBy(seconds) {
      if (ready) frame.contentWindow?.postMessage({ type: 'seekTo', value: Math.max(0, feedTime + seconds), 'x-tiktok-player': true }, '*');
    },
    stripButtons,
    async start() {
      window.addEventListener('message', onMessage);
      extension?.start();
      const data = await loadFeeds();
      if (destroyed) return;
      videos = data?.tiktok?.[profile]?.videos?.filter((id) => /^\d{15,25}$/.test(id)) ?? [];
      const saved = localAccounts()[profile];
      if (saved && Date.now() - (saved.at || 0) > ACCOUNT_TTL) {
        // Refresh an account this browser added a while ago, ready for the next visit.
        lookupAccount(profile)
          .then((fresh) => saveAccount(profile, { title: saved.title || null, videos: fresh, at: Date.now() }))
          .catch(() => {});
      }
      if (!videos.length) {
        const note = (text) => {
          const doc = frame.contentDocument;
          if (!doc) return;
          doc.body.style.cssText = 'margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#000;color:#9a9aa2;font:13px system-ui,sans-serif;text-align:center;padding:0 14px;box-sizing:border-box';
          doc.body.textContent = text;
        };
        frame.src = 'about:blank';
        note(`Looking up @${source.tiktok.profile}…`);
        try {
          videos = await accountVideos(profile);
        } catch {
          if (destroyed) return;
          onError(`Couldn't look up @${source.tiktok.profile} right now. Check the spelling, or try again in a minute.`);
          return;
        }
        if (destroyed) return;
        if (!videos.length) {
          onError(`@${source.tiktok.profile} has no videos from the last month.`);
          return;
        }
      }
      show(0);
    },
    setMuted(next) {
      wanted = next;
      extension?.setMuted(next);
      if (!ready) return;
      const resume = playing;
      send(next ? 'mute' : 'unMute');
      if (resume) send('play');
    },
    setVolume(next) {
      extension?.setVolume(next);
    },
    destroy() {
      destroyed = true;
      extension?.stop();
      window.removeEventListener('message', onMessage);
      frame.removeAttribute('src');
    },
  };
}

function tiktokPlayer(source, options) {
  if (source.tiktok.profile) return tiktokFeedPlayer(source, options);
  const { muted, volume, autoplay, env, onError } = options;
  const frame = makeFrame(buildEmbedUrl(source, { muted, autoplay }, env));
  const extension = hasSoundExtension() ? extensionSound(frame, muted, volume) : null;
  let wanted = muted;
  let ready = false;
  let playing = false;
  let clipTime = 0;
  const send = (type) => frame.contentWindow?.postMessage({ type, 'x-tiktok-player': true }, '*');
  const onMessage = (event) => {
    if (event.source !== frame.contentWindow || !event.data?.['x-tiktok-player']) return;
    if (event.data.type === 'onCurrentTime') {
      clipTime = Number(event.data.value?.currentTime) || 0;
    } else if (event.data.type === 'onPlayerReady') {
      ready = true;
      if (wanted) send('mute'); else send('unMute');
      if (autoplay) send('play');
    } else if (event.data.type === 'onStateChange') {
      playing = event.data.value === 1 || event.data.value === 3;
      if (event.data.value === 1) options.onPlayState?.(false);
      if (event.data.value === 2) options.onPlayState?.(true);
    } else if (event.data.type === 'onPlayerError') {
      const message = TIKTOK_ERRORS[event.data.value?.errorCode];
      if (message) onError(message);
    }
  };
  return {
    el: frame,
    canMute: true,
    canVolume: Boolean(extension) && levelWorks,
    canPause: true,
    setPaused(next) {
      if (ready) send(next ? 'pause' : 'play');
    },
    canSeek: true,
    seekBy(seconds) {
      if (ready) frame.contentWindow?.postMessage({ type: 'seekTo', value: Math.max(0, clipTime + seconds), 'x-tiktok-player': true }, '*');
    },
    start() {
      window.addEventListener('message', onMessage);
      extension?.start();
    },
    setMuted(next) {
      wanted = next;
      extension?.setMuted(next);
      if (!ready) return;
      const resume = playing;
      send(next ? 'mute' : 'unMute');
      // Changing the sound can stop the player, so carry on if it was playing.
      if (resume) send('play');
    },
    setVolume(next) {
      extension?.setVolume(next);
    },
    destroy() {
      extension?.stop();
      window.removeEventListener('message', onMessage);
      frame.removeAttribute('src');
    },
  };
}

/** A player MULTIGRID can't talk to. Its sound is only reachable through the extension. */
function closedPlayer(frame, { muted, volume, describe, onPage }) {
  const extension = hasSoundExtension() ? extensionSound(frame, muted, volume) : null;
  if (describe) embedTiles.set(frame, describe);
  if (onPage) pageTiles.set(frame, onPage);
  return {
    el: frame,
    canMute: Boolean(extension),
    canVolume: Boolean(extension) && levelWorks,
    canPause: Boolean(extension) && extensionCanPause(),
    setPaused(next) { extension?.setPaused(next); },
    canSeek: Boolean(extension) && extensionCanSeek(),
    seekBy(seconds) { extension?.seekBy(seconds); },
    start() {
      extension?.start();
    },
    setMuted(next) {
      extension?.setMuted(next);
    },
    setVolume(next) {
      extension?.setVolume(next);
    },
    destroy() {
      extension?.stop();
      embedTiles.delete(frame);
      pageTiles.delete(frame);
      frame.removeAttribute('src');
    },
  };
}

/* A podcast episode: the browser's own audio player, with the episode's title above it. */
function audioPlayer(source, options) {
  const { muted, volume, autoplay, onError } = options;
  const audio = document.createElement('audio');
  audio.controls = true;
  audio.preload = 'metadata';
  audio.volume = volume / 100;
  audio.muted = muted;
  audio.addEventListener('error', () => onError("This episode didn't load. Its server may be offline."), { once: true });
  const box = el('div', { class: 'audio-tile' },
    el('p', { class: 'audio-label', textContent: 'Podcast' }),
    el('p', { class: 'audio-title', textContent: source.label }),
    audio);
  // Long episodes remember where you stopped.
  const keepPlace = rememberMedia(audio, () => `audio:${source.url}`, () => box, () => options.describe?.());
  return {
    el: box,
    canMute: true,
    canVolume: levelWorks,
    place: () => keepPlace.place(),
    start() {
      audio.src = source.url;
      if (autoplay) audio.play().catch(() => {});
    },
    setMuted(next) { audio.muted = next; },
    setVolume(next) { audio.volume = next / 100; },
    destroy() {
      keepPlace();
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    },
  };
}

/* A Reader story, laid out to read. With the MULTIGRID Sound extension on a computer, the
   real page can replace it in the same tile, because the extension lifts the block on it. */
function readerPlayer(source) {
  const box = el('article', { class: 'reader-story' });
  let destroyed = false;
  const realPage = (link) => {
    const frame = makeFrame(link);
    frame.className = 'reader-real';
    box.replaceWith(frame);
    self.el = frame;
  };
  const actions = (link) => el('p', { class: 'reader-actions' },
    hasSoundExtension() ? el('button', { type: 'button', class: 'reader-pill', textContent: 'Show the real page here', on: { click: () => realPage(link) } }) : null,
    el('a', { class: 'reader-pill', href: link, target: '_blank', rel: 'noopener noreferrer', textContent: 'Open the real page' }));
  const self = {
    el: box,
    canMute: false,
    canVolume: false,
    silent: true,
    async start() {
      box.replaceChildren(el('p', { class: 'reader-note', textContent: 'Loading…' }));
      await loadIndex();
      const item = itemById(source.readerId);
      let story = null;
      try {
        story = await openStory(source.readerId);
      } catch {
        story = null;
      }
      if (destroyed) return;
      const link = story?.link || item?.page || item?.link || '';
      const title = story?.title || item?.title || source.label;
      const parts = [
        el('p', { class: 'reader-meta' },
          item?.source ? el('span', { class: 'reader-src', style: `color:${sourceColor(item.source)}`, textContent: item.source }) : null,
          el('span', { textContent: [item ? ago(item.time) : '', story?.byline].filter(Boolean).join(' · ') })),
        el('h1', { textContent: title }),
      ];
      const picture = item?.image || story?.image;
      if (story?.html) {
        if (picture && !story.html.includes(picture)) parts.push(el('img', { class: 'reader-hero', src: picture, alt: '', referrerPolicy: 'no-referrer' }));
        parts.push(el('div', { class: 'reader-body' }, safeFragment(story.html)));
      } else {
        if (picture) parts.push(el('img', { class: 'reader-hero', src: picture, alt: '', referrerPolicy: 'no-referrer' }));
        if (item?.summary) parts.push(el('p', { class: 'reader-summary', textContent: item.summary }));
        parts.push(el('p', { class: 'reader-note', textContent: !hasKey()
          ? "This device isn't unlocked yet. Open your Reader unlock link on it once to read whole stories here."
          : item?.hasText === false || item?.textTried ? "This site doesn't let its stories be read outside its own page." : 'This story is still being collected. Try again in a few minutes.' }));
      }
      if (link) parts.push(actions(link));
      box.replaceChildren(el('div', { class: 'reader-page' }, ...parts));
    },
    setMuted() {},
    setVolume() {},
    destroy() {
      destroyed = true;
      self.el.removeAttribute?.('src');
    },
  };
  return self;
}

/* An X account plays as a feed: its recent videos, one after another, in the tile itself.
   X only shows a logged-out reader its latest handful of posts, so the list is short. */
const X_FEED_TTL = 30 * 60 * 1000;
const X_VIDEO_TTL = 25 * 60 * 1000;
const X_FEED_KEY = 'multigrid.x.feeds';
const X_VIDEO_KEY = 'multigrid.x.videos';
const X_READER = 'https://r.jina.ai/';

function readXCache(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') || {};
  } catch {
    return {};
  }
}

function writeXCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Remembering is optional; the feed still plays.
  }
}

const X_FRESH = 180 * 86400000;

/** The account's recent posts, newest first, from the page's HTML or its Markdown. */
async function xFeedList(profile) {
  const key = profile.toLowerCase();
  const cache = readXCache(X_FEED_KEY);
  const saved = cache[key];
  if (saved?.ids?.length && Date.now() - (saved.at || 0) < X_FEED_TTL) return saved.ids;
  const ask = (html) => fetch(`${X_READER}https://x.com/${encodeURIComponent(profile)}`, {
    cache: 'no-cache',
    ...(html ? { headers: { 'x-respond-with': 'html' } } : {}),
    signal: AbortSignal.timeout?.(20000),
  });
  let ids = [];
  for (const html of [true, false]) {
    try {
      const response = await ask(html);
      if (!response.ok) continue;
      const text = await response.text();
      const found = html ? parseXProfileHtml(text, profile) : parseXProfile(text, profile);
      ids = found.ids;
      if (ids.length) break;
    } catch {
      // Try the other route before giving up.
    }
  }
  const cutoff = Date.now() - X_FRESH;
  const recent = [...new Set(ids)]
    .filter((id) => {
      const at = xPostedAt(id);
      return !at || at > cutoff;
    })
    .sort((a, b) => {
      try {
        return BigInt(b) > BigInt(a) ? 1 : BigInt(b) < BigInt(a) ? -1 : 0;
      } catch {
        return 0;
      }
    });
  if (!recent.length) throw new Error('No recent posts');
  cache[key] = { ids: recent, at: Date.now() };
  writeXCache(X_FEED_KEY, cache);
  return recent;
}

async function xFeedVideo(profile, id) {
  const cache = readXCache(X_VIDEO_KEY);
  const saved = cache[id];
  if (saved && Date.now() - (saved.at || 0) < X_VIDEO_TTL) return saved.url || '';
  const response = await fetch(`${X_READER}https://x.com/${encodeURIComponent(profile)}/status/${id}`, {
    cache: 'no-cache',
    headers: { 'x-respond-with': 'html' },
    signal: AbortSignal.timeout?.(20000),
  });
  if (!response.ok) return '';
  const url = parseXVideoPage(await response.text());
  cache[id] = { url, at: Date.now() };
  writeXCache(X_VIDEO_KEY, cache);
  return url;
}

function xFeedPlayer(source, options) {
  const { muted, volume, autoplay, onError } = options;
  const profile = source.x.profile;
  const holder = document.createElement('div');
  holder.className = 'player-fill';
  const video = document.createElement('video');
  // Same as a channel: on a phone the browser's own controls cover a muted feed
  // with a giant unmute button, and MULTIGRID's bar already has play and sound.
  video.controls = !touchScreen();
  video.setAttribute('playsinline', '');
  video.preload = 'metadata';
  video.volume = Math.max(0, Math.min(1, Number(volume) / 100));
  video.muted = Boolean(muted);
  let wanted = Boolean(muted);
  let ids = [];
  let index = 0;
  let destroyed = false;
  let fallback = null;
  let asked = null;
  let objectUrl = '';

  const counter = el('span', { class: 'feed-count', textContent: '' });
  const stripButtons = [
    iconButton('back', 'Previous video', () => show(index - 1)),
    counter,
    iconButton('next', 'Next video', () => show(index + 1)),
  ];

  const note = (text) => {
    holder.replaceChildren(el('p', { class: 'feed-note', textContent: text }));
  };

  const embed = (id, at) => {
    fallback = makeFrame(`https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=dark&dnt=true&hideThread=true`);
    fallback.className = 'frame-post';
    holder.replaceChildren(fallback);
    counter.textContent = `${at + 1}/${ids.length}`;
  };

  const release = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = '';
  };

  const show = async (at, tried = 0) => {
    if (!ids.length || destroyed) return;
    index = (at + ids.length) % ids.length;
    const position = index;
    const id = ids[position];
    counter.textContent = `${position + 1}/${ids.length}`;
    const token = {};
    asked = token;
    note('Loading…');
    let url = '';
    try {
      url = await xFeedVideo(profile, id);
    } catch {
      url = '';
    }
    if (destroyed || asked !== token) return;
    if (!url) {
      asked = null;
      // A post without a video file steps aside, unless nothing in the list has one.
      if (tried < ids.length - 1) {
        show(position + 1, tried + 1);
        return;
      }
      embed(id, position);
      return;
    }
    // The video server refuses a request that carries this page as its referrer, so the
    // file is fetched without one and played from memory.
    let blob = null;
    try {
      const response = await fetch(url, { referrerPolicy: 'no-referrer' });
      blob = response.ok ? await response.blob() : null;
    } catch {
      blob = null;
    }
    if (destroyed || asked !== token) return;
    asked = null;
    if (!blob) {
      embed(id, position);
      return;
    }
    fallback = null;
    release();
    objectUrl = URL.createObjectURL(blob);
    video.src = objectUrl;
    holder.replaceChildren(video);
    if (autoplay !== false) video.play().catch(() => {});
    // Pull the next video's address now, so Next is quick.
    const following = ids[(position + 1) % ids.length];
    if (following && ids.length > 1) xFeedVideo(profile, following).catch(() => {});
  };

  video.addEventListener('ended', () => { if (!destroyed) show(index + 1); });
  video.addEventListener('error', () => { if (!destroyed && video.getAttribute('src')) embed(ids[index], index); });
  video.addEventListener('play', () => options.onPlayState?.(false));
  video.addEventListener('pause', () => options.onPlayState?.(true));

  return {
    el: holder,
    canMute: true,
    canVolume: true,
    canPause: true,
    canSeek: true,
    stripButtons,
    async start() {
      note(`Looking up @${profile}…`);
      let found = [];
      try {
        found = await xFeedList(profile);
      } catch {
        if (!destroyed) onError(`X isn't answering for @${profile} right now. Try again in a minute.`);
        return;
      }
      if (destroyed) return;
      ids = found;
      if (!ids.length) {
        onError(`@${profile} has no recent posts.`);
        return;
      }
      show(0);
    },
    setPaused(next) {
      if (next) video.pause();
      else video.play().catch(() => {});
    },
    seekBy(seconds) {
      const duration = Number(video.duration);
      const target = Number(video.currentTime) + Number(seconds);
      video.currentTime = Number.isFinite(duration) && duration > 0 ? Math.max(0, Math.min(duration - 0.2, target)) : Math.max(0, target);
    },
    setMuted(next) {
      wanted = Boolean(next);
      video.muted = wanted;
      if (!wanted) video.play().catch(() => {});
    },
    setVolume(next) {
      video.volume = Math.max(0, Math.min(1, Number(next) / 100));
    },
    destroy() {
      destroyed = true;
      video.pause();
      video.removeAttribute('src');
      video.load?.();
      release();
      fallback?.removeAttribute('src');
    },
  };
}

function xPlayer(source, options) {
  if (source.x?.profile) return xFeedPlayer(source, options);
  const frame = makeFrame(buildEmbedUrl(source, options, options.env));
  frame.className = 'frame-post';
  // A post isn't something to pause; its sound still works through the extension.
  return { ...closedPlayer(frame, options), canPause: false, canSeek: false };
}

const FILE_ACCESS_EVENT = 'multigrid:file-access';

function videoFilesPlayer(items, options, { playlist = false } = {}) {
  const { muted, volume, autoplay, onError } = options;
  const holder = document.createElement('div');
  holder.className = 'player-fill';
  const video = document.createElement('video');
  video.controls = true;
  video.setAttribute('playsinline', '');
  video.volume = volume / 100;
  if (muted) video.setAttribute('muted', '');
  video.muted = muted;
  let objectUrl = null;
  let destroyed = false;
  // A file has no lasting address, so it's known by its name and size.
  let fileKey = '';
  let index = 0;
  let loadToken = 0;
  let waiting = 0;
  let started = false;
  const item = () => items[index] || null;
  const keyOf = (entry) => (entry ? `file:${entry.name}:${entry.size || 0}` : '');
  const keepPlace = rememberMedia(video, () => fileKey, () => holder, () => {
    const current = item();
    const base = options.describe?.() || {};
    return playlist && current ? { ...base, name: current.name } : base;
  });

  const badFormat = "This browser can't play this file's format. MP4 with H.264 is the safest choice.";
  video.addEventListener('error', () => {
    if (video.getAttribute('src')) onError(badFormat);
  });
  video.addEventListener('loadedmetadata', () => {
    // A video track the browser can't decode can leave sound with no picture.
    if (!video.videoWidth) {
      onError(badFormat);
      return;
    }
    if (autoplay) video.play().catch(() => {});
  });

  const counter = playlist && items.length > 1 ? el('span', { class: 'feed-count', textContent: '' }) : null;
  const previous = counter ? iconButton('back', 'Previous episode', () => openIndex(index - 1)) : null;
  const next = counter ? iconButton('next', 'Next episode', () => openIndex(index + 1)) : null;
  const stripButtons = counter ? [previous, counter, next] : null;
  const paintFeed = () => {
    if (!counter) return;
    counter.textContent = `${index + 1}/${items.length}`;
    previous.hidden = index <= 0;
    next.hidden = index >= items.length - 1;
  };

  const playFile = (file) => {
    if (destroyed) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    fileKey = `file:${file.name}:${file.size}`;
    objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    holder.replaceChildren(video);
  };

  const prompt = (message, actions) => {
    video.pause();
    holder.replaceChildren(el('div', { class: 'tile-error' },
      el('p', { textContent: message }),
      el('div', { class: 'tile-error-actions' }, ...actions.map(({ text, action }) => el('button', {
        type: 'button', textContent: text, on: { click: action },
      })))));
  };

  const canSkip = () => playlist && index < items.length - 1;
  const skip = () => { if (canSkip()) openIndex(index + 1); };

  const askToChoose = (moved) => {
    const current = item();
    if (!current) return;
    const message = moved
      ? `${current.name} isn't where it was. It may have moved or been renamed.`
      : `${current.name} is on your computer and isn't loaded right now.`;
    const actions = [{
      text: 'Choose the file',
      action: async () => {
        const file = await chooseAgain(current.id);
        if (file && !destroyed && item() === current) playFile(file);
      },
    }];
    if (canSkip()) actions.push({ text: 'Skip episode', action: skip });
    prompt(message, actions);
  };

  // Allowing one file can allow them all ("Allow on every visit"), so waiting tiles recheck.
  const recheck = () => {
    const current = item();
    if (!current) return;
    const token = waiting;
    findFile(current.id).then((result) => {
      if (token !== waiting || destroyed || item() !== current) return;
      if (result.file) handle(result);
    });
  };

  const handle = (result) => {
    if (destroyed) return;
    const current = item();
    if (!current) return;
    if (result.file) {
      window.removeEventListener(FILE_ACCESS_EVENT, recheck);
      playFile(result.file);
    } else if (result.needsClick) {
      waiting = loadToken;
      window.addEventListener(FILE_ACCESS_EVENT, recheck);
      const actions = [{
        text: 'Reopen file',
        action: async () => {
          const opened = await reopen(current.id);
          if (item() !== current) return;
          handle(opened);
          if (opened.file) window.dispatchEvent(new Event(FILE_ACCESS_EVENT));
        },
      }];
      if (canSkip()) actions.push({ text: 'Skip episode', action: skip });
      prompt(`${current.name} is ready to reopen.`, actions);
    } else askToChoose(result.moved);
  };

  const startingIndex = () => {
    if (!playlist) return 0;
    const spots = items
      .map((entry, at) => ({ at, place: placeOf(keyOf(entry)) }))
      .filter((spot) => spot.place?.at > 0);
    if (spots.length) {
      spots.sort((a, b) => b.place.saved - a.place.saved);
      return spots[0].at;
    }
    const firstOpen = items.findIndex((entry) => !isPlayed(keyOf(entry)));
    return firstOpen === -1 ? 0 : firstOpen;
  };

  function openIndex(nextIndex) {
    if (destroyed || nextIndex < 0 || nextIndex >= items.length) return;
    if (item()) keepPlace();
    keepPlace.reset();
    window.removeEventListener(FILE_ACCESS_EVENT, recheck);
    index = nextIndex;
    fileKey = '';
    loadToken += 1;
    const token = loadToken;
    waiting = token;
    paintFeed();
    const chosen = item();
    if (!chosen) return;
    if (playlist) options.onEpisode?.(chosen.name);
    video.pause();
    video.removeAttribute('src');
    video.load();
    findFile(chosen.id).then((result) => {
      if (destroyed || token !== loadToken || item() !== chosen) return;
      handle(result);
    });
  }

  if (playlist) {
    video.addEventListener('ended', () => {
      if (index < items.length - 1) openIndex(index + 1);
    });
  }

  return {
    el: holder,
    // The video only goes into the tile once the file is opened, so it's named here for pausing.
    media: video,
    canMute: true,
    canVolume: levelWorks,
    ...(stripButtons ? { stripButtons, stripLabels: ['Previous episode', 'Next episode'] } : {}),
    start() {
      if (started) return;
      started = true;
      openIndex(startingIndex());
    },
    setMuted(next) {
      video.muted = next;
    },
    setVolume(next) {
      video.volume = next / 100;
    },
    destroy() {
      keepPlace();
      destroyed = true;
      loadToken += 1;
      window.removeEventListener(FILE_ACCESS_EVENT, recheck);
      video.removeAttribute('src');
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
  };
}

function filePlayer(source, options) {
  return videoFilesPlayer([{ id: source.localId, name: source.name }], options);
}

function playlistPlayer(source, options) {
  return videoFilesPlayer(source.items, options, { playlist: true });
}

function genericPlayer(source, options) {
  // Not sandboxed: some players refuse to run in a sandbox. The browser still keeps a
  // page from another site out of MULTIGRID and its saved layouts.
  return closedPlayer(makeFrame(source.url), options);
}

/* A note: plain text that lives with the layout. It saves quietly as it's typed. */
function notePlayer(source, options) {
  const holder = document.createElement('div');
  holder.className = 'note-tile';
  const area = document.createElement('textarea');
  area.className = 'note-area';
  area.value = source.note?.text || '';
  area.placeholder = 'Type a note…';
  area.spellcheck = true;
  area.setAttribute('aria-label', 'Note');
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = null;
    options.onNoteText?.(area.value);
  };
  area.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(save, 500);
  });
  area.addEventListener('blur', save);
  holder.append(area);
  return {
    el: holder,
    canMute: false,
    canPause: false,
    canSeek: false,
    start() {},
    focus() { area.focus(); },
    setMuted() {},
    setVolume() {},
    setPaused() {},
    seekBy() {},
    destroy() {
      clearTimeout(timer);
    },
  };
}

const PLAYERS = {
  youtube: youtubePlayer,
  note: notePlayer,
  twitch: twitchPlayer,
  kick: addressMutedPlayer,
  tiktok: tiktokPlayer,
  x: xPlayer,
  file: filePlayer,
  playlist: playlistPlayer,
  hls: hlsPlayer,
  iframe: genericPlayer,
  reader: readerPlayer,
  audio: audioPlayer,
  boxscore: boxScorePlayer,
};

/* A game's box score in a tile: no sound, it just keeps itself up to date. */
function boxScorePlayer(source) {
  const box = el('div', { class: 'boxscore' });
  let stop = null;
  return {
    el: box,
    canMute: false,
    canVolume: false,
    silent: true,
    start() { stop = runBoxScore(box, source.path, source.gameId); },
    setMuted() {},
    setVolume() {},
    destroy() { stop?.(); },
  };
}

/** Returns a player, or throws-free null with onError called if it can't even be tried. */
export function createPlayer(source, options) {
  if (isBlockedMixedContent(source, options.env)) {
    options.onError('This link starts with http, and browsers block that on a secure page. Try an https version.');
    return null;
  }
  const player = PLAYERS[source.kind](source, options);
  // Players built on the browser's own video or audio element can pause directly.
  const media = player && !player.canPause && (player.media || (player.el instanceof HTMLMediaElement ? player.el : player.el?.querySelector?.('video, audio')));
  if (media) {
    player.canPause = true;
    player.setPaused = (next) => { if (next) media.pause(); else media.play().catch(() => {}); };
    player.canSeek = true;
    // Only as far as the browser can reach: a live stream keeps a short stretch to go back over.
    player.seekBy = (seconds) => {
      const range = media.seekable;
      if (!range?.length) return;
      const start = range.start(0);
      const end = range.end(range.length - 1);
      media.currentTime = Math.min(end, Math.max(start, media.currentTime + seconds));
    };
    media.addEventListener('play', () => options.onPlayState?.(false));
    media.addEventListener('pause', () => options.onPlayState?.(true));
  }
  return player;
}
