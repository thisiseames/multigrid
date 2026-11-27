// The Live Room: a separate workspace for TikTok lives. It is not saved as a layout and the
// main wall is kept aside while it is open. Pure workspace building; the page owns the wall
// snapshot, the room panel and the Live menu.

import { applyPreset, emptyWorkspace, uid } from './layout.js';

export const LIVE_ROOM_MAX = 4;

/** The four formats the room offers, in the owner's words. */
export const LIVE_ROOM_LAYOUTS = [
  { id: 'single', label: '1', capacity: 1 },
  { id: 'liveRow', label: '1 beside 1', capacity: 2 },
  { id: 'liveStack', label: '1 over 1', capacity: 2 },
  { id: 'grid2', label: '2 × 2', capacity: 4 },
];

export const liveRoomLayout = (id) => LIVE_ROOM_LAYOUTS.find((layout) => layout.id === id) ?? LIVE_ROOM_LAYOUTS[0];

/** One live starts alone; two start side by side; three or four start in the 2 × 2 block. */
export const defaultLiveRoomLayout = (count) => (Number(count) <= 1 ? 'single' : Number(count) === 2 ? 'liveRow' : 'grid2');

const liveTiles = (ws) => ws.tiles.filter((tile) => Boolean(tile.input));

/** Applies one of the four formats. Lives beyond its capacity stay in the room, hidden. */
export function applyLiveRoomLayout(ws, presetId) {
  const layout = liveRoomLayout(presetId);
  applyPreset(ws, layout.id, layout.capacity);
  ws.liveRoom = { ...(ws.liveRoom || {}), presetId: layout.id };
  return ws;
}

/** A fresh room workspace: the clicked live first, then any TikTok lives already on the wall. */
export function workspaceForLiveRoom(feeds = [], presetId = '') {
  const next = emptyWorkspace();
  const list = (Array.isArray(feeds) ? feeds : []).filter((feed) => feed?.input).slice(0, LIVE_ROOM_MAX);
  next.tiles = list.map((feed, index) => ({
    id: uid(),
    input: feed.input,
    ...(feed.name ? { title: feed.name } : {}),
    muted: index > 0,
    volume: 100,
    place: null,
    ...(index === 0 ? { primary: true } : {}),
    ...(feed.favorite && feed.favorite !== feed.input ? { favorite: feed.favorite } : {}),
  }));
  applyLiveRoomLayout(next, liveRoomLayout(presetId).id);
  return next;
}

/** Adds a live to the room, growing the format when the current one is full. Null when full. */
export function addLiveRoomFeed(ws, feed) {
  if (!ws?.liveRoom || !feed?.input) return null;
  const same = liveTiles(ws).find((tile) => tile.input === feed.input);
  if (same) return same.id;
  if (liveTiles(ws).length >= LIVE_ROOM_MAX) return null;
  ws.tiles.push({
    id: uid(),
    input: feed.input,
    ...(feed.name ? { title: feed.name } : {}),
    muted: true,
    volume: 100,
    place: null,
  });
  const total = liveTiles(ws).length;
  const current = liveRoomLayout(ws.liveRoom.presetId);
  const next = total > current.capacity ? (total <= 2 ? 'liveRow' : 'grid2') : current.id;
  applyLiveRoomLayout(ws, next);
  return liveTiles(ws).find((tile) => tile.input === feed.input)?.id || null;
}

const setMain = (ws, tile) => {
  for (const other of liveTiles(ws)) {
    other.primary = other === tile;
    other.muted = other !== tile;
  }
  tile.volume = tile.volume || 100;
  return tile.id;
};

/** Makes one live the main picture and gives it the sound. */
export function mainLiveRoomTile(ws, id) {
  const tile = liveTiles(ws).find((candidate) => candidate.id === id);
  return tile ? setMain(ws, tile) : '';
}

/**
 * The main click in the room switches the main live in place, keeping the room's count and
 * format. A live already in the room just becomes main. Returns the tile id, or ''.
 */
export function replaceLiveRoomMain(ws, feed) {
  if (!ws?.liveRoom || !feed?.input) return '';
  const same = liveTiles(ws).find((tile) => tile.input === feed.input);
  if (same) {
    // A live hidden by a smaller format needs the 2 × 2 block to be visible again.
    if (!same.place) applyLiveRoomLayout(ws, 'grid2');
    return setMain(ws, same);
  }
  const main = liveTiles(ws).find((tile) => tile.primary && tile.place)
    || liveTiles(ws).find((tile) => tile.place)
    || liveTiles(ws)[0];
  if (!main) return addLiveRoomFeed(ws, feed) || '';
  main.input = feed.input;
  if (feed.name) main.title = feed.name;
  else delete main.title;
  delete main.favorite;
  return setMain(ws, main);
}
