// Sends a video-link tile to a TV: Chromecast from Chrome, AirPlay from Safari. Website embeds
// can't be sent this way, because only a plain video address can be handed to the TV.
// Chrome's part is Google's free Cast library, loaded only once a video-link tile exists.

const SENDER = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
let loading = null;
let tvFound = false;
const watchers = new Set();
const tell = () => watchers.forEach((watch) => watch());

/** Calls watch() whenever a TV appears or goes away, so buttons can show or hide. */
export function onTvChange(watch) { watchers.add(watch); }

/** Whether this browser has Chrome's Cast built in (Chrome or Edge on a computer or Android). */
const hasChromeCast = () => Boolean(window.chrome) && !/iPhone|iPad|iPod/.test(navigator.userAgent);

/** Loads Google's Cast library once, and keeps tvFound up to date. Resolves false where it can't work. */
export function startCast() {
  if (loading) return loading;
  if (!hasChromeCast()) {
    loading = Promise.resolve(false);
    return loading;
  }
  loading = new Promise((resolve) => {
    const done = (ok) => resolve(Boolean(ok));
    if (window.cast?.framework && window.chrome?.cast?.media) { done(true); return; }
    window.__onGCastApiAvailable = done;
    const script = document.createElement('script');
    script.src = SENDER;
    script.onerror = () => done(false);
    document.head.append(script);
    setTimeout(() => done(false), 15000);
  }).then((ok) => {
    if (!ok || !window.cast?.framework) return false;
    const { framework } = window.cast;
    const context = framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    const update = () => {
      const found = context.getCastState() !== framework.CastState.NO_DEVICES_AVAILABLE;
      if (found !== tvFound) { tvFound = found; tell(); }
    };
    context.addEventListener(framework.CastContextEventType.CAST_STATE_CHANGED, update);
    update();
    return true;
  }).catch(() => false);
  return loading;
}

/** Safari's AirPlay, for this video, once a TV or speaker has been found. */
const airPlays = new WeakMap(); // video -> found
export function watchAirPlay(video) {
  if (!video || typeof video.webkitShowPlaybackTargetPicker !== 'function' || airPlays.has(video)) return;
  airPlays.set(video, false);
  video.addEventListener('webkitplaybacktargetavailabilitychanged', (event) => {
    airPlays.set(video, event.availability === 'available');
    tell();
  });
}

/** Which way this tile can go to a TV right now: 'cast', 'airplay' or ''. */
export function castWay(source, video) {
  if (!source?.ok || source.kind !== 'hls') return '';
  if (airPlays.get(video)) return 'airplay';
  return tvFound ? 'cast' : '';
}

/**
 * Sends the tile's video to the TV. Chrome shows its own list of TVs first. Resolves with what
 * happened: 'sent', 'cancelled' or 'failed'.
 */
export async function castTile(source, video, name) {
  const way = castWay(source, video);
  if (way === 'airplay') {
    video.webkitShowPlaybackTargetPicker();
    return 'sent';
  }
  if (way !== 'cast' || !(await startCast())) return 'failed';
  const { cast, chrome } = window;
  const context = cast.framework.CastContext.getInstance();
  try {
    await context.requestSession();
  } catch {
    return 'cancelled';
  }
  const session = context.getCurrentSession();
  if (!session) return 'cancelled';
  const info = new chrome.cast.media.MediaInfo(source.url, 'application/x-mpegURL');
  const recording = Number.isFinite(video?.duration);
  info.streamType = recording ? chrome.cast.media.StreamType.BUFFERED : chrome.cast.media.StreamType.LIVE;
  info.metadata = new chrome.cast.media.GenericMediaMetadata();
  info.metadata.title = name;
  const request = new chrome.cast.media.LoadRequest(info);
  request.autoplay = true;
  // A recording carries on from where the tile is.
  if (recording && video.currentTime > 5) request.currentTime = Math.floor(video.currentTime);
  try {
    await session.loadMedia(request);
    return 'sent';
  } catch {
    return 'failed';
  }
}
