// Pop out: one stream floats in its own small window over other apps.
//
// Chrome on a computer can pop out anything. The window starts empty, and YouTube refuses to
// play in a page with no address, so streams play inside pop.html, a page of MULTIGRID's own.
// A file on this computer is the exception: only this page holds it, so its player is built
// here and placed in the window. Safari, including on iPhone, can only float a plain video,
// and not from the Home Screen icon (an Apple bug), so there it's own files and video links.

const docWindow = () => 'documentPictureInPicture' in window;
const fromHomeScreen = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let current = null; // { view, win, player }

function videoOf(view) {
  const player = view.player;
  if (!player) return null;
  if (player.media instanceof HTMLVideoElement) return player.media;
  if (player.el instanceof HTMLVideoElement) return player.el;
  return player.el?.querySelector?.('video') || null;
}

const videoFloats = (video) => Boolean(video && (
  (document.pictureInPictureEnabled && !video.disablePictureInPicture) || typeof video.webkitSetPresentationMode === 'function'));

/** Whether this tile gets a Pop out button. */
export function canPopOut(view) {
  if (!view.source?.ok) return false;
  if (docWindow()) return view.source.kind !== 'reader';
  if (fromHomeScreen()) return false;
  return videoFloats(videoOf(view));
}

export const isPoppedOut = (view) => current?.view === view;

/** Puts a popped-out stream back in its tile. */
export function bringBack() {
  current?.win?.close();
}

const STYLE = `
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  .pop { width: 100%; height: 100%; }
  .pop iframe, .pop video, .pop .player-fill { display: block; width: 100%; height: 100%; border: 0; }
  .pop video { object-fit: contain; background: #000; }
`;

/**
 * Pops a tile's stream out. makePlayer(source) builds a player (used for a file, which only
 * this page can reach). The tile shows "Playing in pop-out" until the window closes.
 */
export async function popOut(view, { name, makePlayer }) {
  if (!docWindow()) {
    const video = videoOf(view);
    if (!video) return;
    if (document.pictureInPictureElement === video) {
      await document.exitPictureInPicture().catch(() => {});
    } else if (video.requestPictureInPicture && document.pictureInPictureEnabled) {
      await video.requestPictureInPicture();
    } else {
      video.webkitSetPresentationMode(video.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
    }
    return;
  }
  if (current) {
    const same = current.view === view;
    bringBack();
    if (same) return;
  }
  const win = await window.documentPictureInPicture.requestWindow({ width: 480, height: 270 });
  const style = win.document.createElement('style');
  style.textContent = STYLE;
  win.document.head.append(style);
  win.document.title = name;
  const box = win.document.createElement('div');
  box.className = 'pop';
  win.document.body.append(box);
  current = { view, win, player: null };
  // The tile lets go of its player first, which also saves the place to pick up from.
  view.remount();
  const { tile, source } = view;
  if (source.kind === 'file') {
    const player = makePlayer(source);
    current.player = player;
    if (player) {
      box.append(player.el);
      player.start();
    }
  } else {
    const frame = win.document.createElement('iframe');
    frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    frame.allowFullscreen = true;
    frame.src = `pop.html#${encodeURIComponent(JSON.stringify({ input: tile.input, name, muted: tile.muted, volume: tile.volume }))}`;
    box.append(frame);
  }
  win.addEventListener('pagehide', () => {
    if (current?.win !== win) return;
    current.player?.destroy();
    current = null;
    view.remount();
  }, { once: true });
}
