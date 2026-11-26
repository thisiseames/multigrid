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
let gridPop = null; // { win, views: Set } while the whole grid floats

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
  // A profile or channel card opens videos in the grid; it isn't a stream to float.
  if (view.source.kind === 'tiktokprofile' || view.source.kind === 'youtubechannel') return false;
  if (docWindow()) return view.source.kind !== 'reader';
  if (fromHomeScreen()) return false;
  return videoFloats(videoOf(view));
}

export const isPoppedOut = (view) => current?.view === view || Boolean(gridPop?.views.has(view));
export const isGridPoppedOut = () => Boolean(gridPop);
export const canPopOutGrid = () => docWindow();

/** Puts a popped-out stream back in its tile. */
export function bringBack() {
  current?.win?.close();
  gridPop?.win?.close();
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
    // A series that moved on to a later episode pops out on that episode.
    frame.src = `pop.html#${encodeURIComponent(JSON.stringify({ input: view.page || tile.input, name, muted: tile.muted, volume: tile.volume }))}`;
    box.append(frame);
  }
  win.addEventListener('pagehide', () => {
    if (current?.win !== win) return;
    current.player?.destroy();
    current = null;
    view.remount();
  }, { once: true });
}

const GRID_STYLE = `
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; font-family: system-ui, -apple-system, sans-serif; }
  .pgrid { display: grid; width: 100%; height: 100%; gap: 2px; background: #000; }
  .pcell { position: relative; min-width: 0; min-height: 0; background: #000; overflow: hidden; }
  .pcell iframe { display: block; width: 100%; height: 100%; border: 0; }
  .psound { position: absolute; top: 6px; left: 6px; z-index: 2; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
    border: 0; border-radius: 50%; background: rgba(0, 0, 0, .62); color: rgba(245, 245, 247, .8); cursor: pointer; opacity: 0; transition: opacity .12s; }
  .pcell:hover .psound, .psound.is-on { opacity: 1; }
  .psound.is-on { background: #f5f5f7; color: #0b0b0d; }
  .psound svg { width: 15px; height: 15px; }
`;
const SOUND_ON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h2l3-2.5v9L5 10H3z" fill="currentColor"/><path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.8a6 6 0 0 1 0 8.4"/></svg>';
const SOUND_OFF = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h2l3-2.5v9L5 10H3z" fill="currentColor"/><path d="M11 6l3.5 4M14.5 6L11 10"/></svg>';

/**
 * Floats the whole grid in its own always-on-top window, laid out as on the page. `tiles` are
 * [{ view, name, area, muted, volume }] (area: CSS grid-area); `cols` and `rows` are the grid's
 * track templates. Each stream plays in pop.html, as a single pop-out does. The speaker in a
 * stream's corner gives it the sound (onSound(id)); Twitch gets no button, as anything over its
 * picture stops it. Closing the window puts every stream back in its tile.
 */
export async function popOutGrid(tiles, { cols, rows, onSound, onClosed }) {
  if (current) bringBack();
  if (gridPop) { bringBack(); return; }
  const win = await window.documentPictureInPicture.requestWindow({ width: 640, height: 360 });
  const style = win.document.createElement('style');
  style.textContent = GRID_STYLE;
  win.document.head.append(style);
  win.document.title = 'MULTIGRID';
  const board = win.document.createElement('div');
  board.className = 'pgrid';
  board.style.gridTemplateColumns = cols;
  board.style.gridTemplateRows = rows;
  win.document.body.append(board);
  gridPop = { win, views: new Set(tiles.map((tile) => tile.view)) };
  const cells = [];
  for (const tile of tiles) {
    const cell = win.document.createElement('div');
    cell.className = 'pcell';
    cell.style.gridArea = tile.area;
    const frame = win.document.createElement('iframe');
    frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    frame.src = `pop.html#${encodeURIComponent(JSON.stringify({ input: tile.view.page || tile.view.tile.input, name: tile.name, muted: tile.muted, volume: tile.volume }))}`;
    cell.append(frame);
    let button = null;
    if (tile.view.source?.kind !== 'twitch') {
      button = win.document.createElement('button');
      button.type = 'button';
      button.className = `psound${tile.muted ? '' : ' is-on'}`;
      button.title = `Sound: ${tile.name}`;
      button.innerHTML = tile.muted ? SOUND_OFF : SOUND_ON;
      button.addEventListener('click', () => {
        for (const other of cells) {
          const on = other.tile === tile;
          other.frame.contentWindow?.postMessage({ type: 'mg-mute', muted: !on }, location.origin);
          if (other.button) { other.button.classList.toggle('is-on', on); other.button.innerHTML = on ? SOUND_ON : SOUND_OFF; }
        }
        onSound?.(tile.view.id);
      });
      cell.append(button);
    }
    cells.push({ tile, frame, button });
    board.append(cell);
  }
  // The tiles let go of their players (each shows "Playing in pop-out") so nothing plays twice.
  for (const tile of tiles) tile.view.remount();
  win.addEventListener('pagehide', () => {
    if (gridPop?.win !== win) return;
    const views = [...gridPop.views];
    gridPop = null;
    for (const view of views) view.remount();
    onClosed?.();
  }, { once: true });
}
