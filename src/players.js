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
import { el } from './ui.js';

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

/** The MULTIGRID Sound extension says it's here. It can reach a player inside any embed. */
const hasSoundExtension = () => document.documentElement.dataset.multigridSound === '1';

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
    stop() {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('pointerdown', send);
    },
  };
}

/** Players whose only sound control is their address: changing it reloads the player. */
function addressMutedPlayer(source, options) {
  const { muted, volume, autoplay, env } = options;
  const frame = makeFrame(buildEmbedUrl(source, { muted, autoplay }, env));
  const extension = hasSoundExtension() ? extensionSound(frame, muted, volume) : null;
  return {
    el: frame,
    canMute: true,
    canVolume: Boolean(extension) && levelWorks,
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

function youtubePlayer(source, options) {
  const { muted, volume, autoplay, env, onError, onCapability } = options;
  const frame = makeFrame(buildEmbedUrl(source, { muted, autoplay }, env));
  let api = null;
  let wanted = muted;
  let level = volume;
  let destroyed = false;
  const self = {
    el: frame,
    canMute: true,
    canVolume: levelWorks,
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
              api.setVolume(level);
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
  video.controls = true;
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

function tiktokPlayer(source, options) {
  const { muted, volume, autoplay, env, onError } = options;
  const frame = makeFrame(buildEmbedUrl(source, { muted, autoplay }, env));
  const extension = hasSoundExtension() ? extensionSound(frame, muted, volume) : null;
  let wanted = muted;
  let ready = false;
  let playing = false;
  const send = (type) => frame.contentWindow?.postMessage({ type, 'x-tiktok-player': true }, '*');
  const onMessage = (event) => {
    if (event.source !== frame.contentWindow || !event.data?.['x-tiktok-player']) return;
    if (event.data.type === 'onPlayerReady') {
      ready = true;
      if (wanted) send('mute'); else send('unMute');
      if (autoplay) send('play');
    } else if (event.data.type === 'onStateChange') {
      playing = event.data.value === 1 || event.data.value === 3;
    } else if (event.data.type === 'onPlayerError') {
      const message = TIKTOK_ERRORS[event.data.value?.errorCode];
      if (message) onError(message);
    }
  };
  return {
    el: frame,
    canMute: true,
    canVolume: Boolean(extension) && levelWorks,
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
function closedPlayer(frame, { muted, volume }) {
  const extension = hasSoundExtension() ? extensionSound(frame, muted, volume) : null;
  return {
    el: frame,
    canMute: Boolean(extension),
    canVolume: Boolean(extension) && levelWorks,
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
      frame.removeAttribute('src');
    },
  };
}

function xPlayer(source, options) {
  const frame = makeFrame(buildEmbedUrl(source, options, options.env));
  frame.className = 'frame-post';
  return closedPlayer(frame, options);
}

const FILE_ACCESS_EVENT = 'multigrid:file-access';

function filePlayer(source, options) {
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

  const play = (file) => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    holder.replaceChildren(video);
  };

  const prompt = (message, buttonText, action) => {
    const button = el('button', { type: 'button', textContent: buttonText, on: { click: action } });
    holder.replaceChildren(el('div', { class: 'tile-error' },
      el('p', { textContent: message }),
      el('div', { class: 'tile-error-actions' }, button)));
  };

  const askToChoose = (moved) => {
    const message = moved
      ? `${source.name} isn't where it was. It may have moved or been renamed.`
      : `${source.name} is on your computer and isn't loaded right now.`;
    prompt(message, 'Choose the file', async () => {
      const file = await chooseAgain(source.localId);
      if (file && !destroyed) play(file);
    });
  };

  // Allowing one file can allow them all ("Allow on every visit"), so waiting tiles recheck.
  const recheck = () => findFile(source.localId).then((result) => {
    if (result.file) handle(result);
  });

  const handle = (result) => {
    if (destroyed) return;
    if (result.file) {
      window.removeEventListener(FILE_ACCESS_EVENT, recheck);
      play(result.file);
    } else if (result.needsClick) {
      window.addEventListener(FILE_ACCESS_EVENT, recheck);
      prompt(`${source.name} is ready to reopen.`, 'Reopen file', async () => {
        const next = await reopen(source.localId);
        handle(next);
        if (next.file) window.dispatchEvent(new Event(FILE_ACCESS_EVENT));
      });
    } else askToChoose(result.moved);
  };

  return {
    el: holder,
    canMute: true,
    canVolume: levelWorks,
    start() {
      findFile(source.localId).then(handle);
    },
    setMuted(next) {
      video.muted = next;
    },
    setVolume(next) {
      video.volume = next / 100;
    },
    destroy() {
      destroyed = true;
      window.removeEventListener(FILE_ACCESS_EVENT, recheck);
      video.removeAttribute('src');
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
  };
}

function genericPlayer(source, options) {
  // Not sandboxed: some players refuse to run in a sandbox. The browser still keeps a
  // page from another site out of MULTIGRID and its saved layouts.
  return closedPlayer(makeFrame(source.url), options);
}

const PLAYERS = {
  youtube: youtubePlayer,
  twitch: twitchPlayer,
  kick: addressMutedPlayer,
  tiktok: tiktokPlayer,
  x: xPlayer,
  file: filePlayer,
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
