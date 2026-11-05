// Player rendering: one small player per kind of source, all with the same shape.
//
//   el        the element to put in the tile
//   start()   begins playback; called once `el` is in the page
//   canMute   whether this player's sound can be controlled from here
//   setMuted  changes the sound
//   destroy() stops everything
//
// Problems are reported through onError(message). Only a parsed source's address is ever
// used: nothing pasted by the user reaches the page as HTML.

import { buildEmbedUrl, isBlockedMixedContent } from './sources.js';

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

function makeFrame(src, { sandboxed = false } = {}) {
  const frame = document.createElement('iframe');
  frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.title = 'Video player';
  if (sandboxed) {
    // A pasted page may run and play, but it can't navigate MULTIGRID away.
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox allow-forms');
  }
  frame.src = src;
  return frame;
}

/** Players whose only sound control is their address: changing it reloads the player. */
function addressMutedPlayer(source, options) {
  const { muted, autoplay, env } = options;
  const frame = makeFrame(buildEmbedUrl(source, { muted, autoplay }, env));
  return {
    el: frame,
    canMute: true,
    start() {},
    setMuted(next) {
      frame.src = buildEmbedUrl(source, { muted: next, autoplay: true }, env);
    },
    destroy() {
      frame.removeAttribute('src');
    },
  };
}

const YOUTUBE_ERRORS = {
  2: "YouTube says this video's link isn't valid.",
  5: "This video can't play in this browser.",
  100: 'This video is private, removed or not found.',
  101: "The owner of this video doesn't allow it to play on other sites.",
  150: "The owner of this video doesn't allow it to play on other sites.",
  152: "YouTube won't play this video on other sites.",
  153: 'YouTube needs to know which site this is, and your browser hid that. A privacy setting or extension may be the cause.',
};

function youtubePlayer(source, options) {
  const { muted, autoplay, env, onError, onCapability } = options;
  const frame = makeFrame(buildEmbedUrl(source, { muted, autoplay }, env));
  let api = null;
  let wanted = muted;
  let destroyed = false;
  const self = {
    el: frame,
    canMute: true,
    start() {
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
              if (wanted) api.mute(); else api.unMute();
            },
            onError(event) {
              onError(YOUTUBE_ERRORS[event.data] || `YouTube couldn't play this (code ${event.data}).`);
            },
          },
        });
      }).catch(() => {
        // The video still plays; only our button goes, because it couldn't do anything.
        self.canMute = false;
        onCapability();
      });
    },
    setMuted(next) {
      wanted = next;
      if (!api) return;
      if (next) api.mute(); else api.unMute();
    },
    destroy() {
      destroyed = true;
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

  const { muted, autoplay, env } = options;
  const holder = document.createElement('div');
  holder.className = 'player-fill';
  holder.id = `twitch-embed-${twitchEmbedCount++}`;
  let api = null;
  let fallback = null;
  let wanted = muted;
  let destroyed = false;
  let wasPlaying = false;
  return {
    el: holder,
    canMute: true,
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
        });
      }).catch(() => {
        if (destroyed) return;
        fallback = addressMutedPlayer(source, { ...options, muted: wanted });
        holder.append(fallback.el);
      });
    },
    setMuted(next) {
      wanted = next;
      if (api) api.setMuted(next);
      else if (fallback) fallback.setMuted(next);
    },
    destroy() {
      destroyed = true;
      holder.replaceChildren();
    },
  };
}

function hlsPlayer(source, options) {
  const { muted, autoplay, onError } = options;
  const video = document.createElement('video');
  video.controls = true;
  video.setAttribute('playsinline', '');
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
    destroy() {
      destroyed = true;
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    },
  };
}

function genericPlayer(source) {
  const frame = makeFrame(source.url, { sandboxed: true });
  return {
    el: frame,
    canMute: false,
    start() {},
    setMuted() {},
    destroy() {
      frame.removeAttribute('src');
    },
  };
}

const PLAYERS = {
  youtube: youtubePlayer,
  twitch: twitchPlayer,
  kick: addressMutedPlayer,
  hls: hlsPlayer,
  iframe: genericPlayer,
};

/** Returns a player, or throws-free null with onError called if it can't even be tried. */
export function createPlayer(source, options) {
  if (isBlockedMixedContent(source, options.env)) {
    options.onError('This link starts with http, and browsers block that on a secure page. Try an https version.');
    return null;
  }
  return PLAYERS[source.kind](source, options);
}
