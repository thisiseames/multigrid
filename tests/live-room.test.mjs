import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLiveRoomLayout, addLiveRoomFeed, defaultLiveRoomLayout, LIVE_ROOM_LAYOUTS, mainLiveRoomTile,
  replaceLiveRoomMain, workspaceForLiveRoom,
} from '../src/live-room.js';
import { hiddenTiles, isVisible, streamCount } from '../src/layout.js';

const feed = (name) => ({ input: `tiktoklive:${name}`, name: `@${name}` });
const feeds = (...names) => names.map(feed);

test('live room: one, two beside, two stacked and 2 × 2', () => {
  const one = workspaceForLiveRoom(feeds('a'));
  assert.equal(one.presetId, 'single');
  assert.equal(one.liveRoom.presetId, 'single');
  assert.equal(streamCount(one), 1);
  assert.equal(one.tiles.find((tile) => tile.input).primary, true);
  assert.equal(one.tiles.find((tile) => tile.input).muted, false);

  const beside = workspaceForLiveRoom(feeds('a', 'b'), 'liveRow');
  assert.equal(beside.presetId, 'liveRow');
  assert.equal(beside.cols.length, 2);
  assert.equal(beside.rows.length, 1);
  assert.equal(streamCount(beside), 2);
  assert.equal(beside.tiles[1].muted, true);

  const stacked = workspaceForLiveRoom(feeds('a', 'b'), 'liveStack');
  assert.equal(stacked.presetId, 'liveStack');
  assert.equal(stacked.cols.length, 1);
  assert.equal(stacked.rows.length, 2);

  const four = workspaceForLiveRoom(feeds('a', 'b', 'c', 'd'), 'grid2');
  assert.equal(four.presetId, 'grid2');
  assert.equal(streamCount(four), 4);
  assert.equal(four.tiles.filter(isVisible).length, 4);
});

test('live room: three lives in 2 × 2 keep one empty slot, and five feeds are capped at four', () => {
  const three = workspaceForLiveRoom(feeds('a', 'b', 'c'), 'grid2');
  assert.equal(streamCount(three), 3);
  assert.equal(three.tiles.filter(isVisible).length, 4);
  assert.equal(three.tiles.filter((tile) => !tile.input).length, 1);

  const five = workspaceForLiveRoom(feeds('a', 'b', 'c', 'd', 'e'), 'grid2');
  assert.equal(streamCount(five), 4);
});

test('live room: defaults follow the count', () => {
  assert.equal(defaultLiveRoomLayout(0), 'single');
  assert.equal(defaultLiveRoomLayout(1), 'single');
  assert.equal(defaultLiveRoomLayout(2), 'liveRow');
  assert.equal(defaultLiveRoomLayout(3), 'grid2');
  assert.equal(defaultLiveRoomLayout(4), 'grid2');
});

test('live room: adding a live grows the format, and a fifth is refused', () => {
  const ws = workspaceForLiveRoom(feeds('a'));
  assert.equal(addLiveRoomFeed(ws, feed('b')), ws.tiles.find((tile) => tile.input === 'tiktoklive:b').id);
  assert.equal(ws.presetId, 'liveRow');
  assert.equal(streamCount(ws), 2);

  addLiveRoomFeed(ws, feed('c'));
  assert.equal(ws.presetId, 'grid2');
  assert.equal(streamCount(ws), 3);

  addLiveRoomFeed(ws, feed('d'));
  assert.equal(streamCount(ws), 4);
  assert.equal(addLiveRoomFeed(ws, feed('e')), null);
  assert.equal(streamCount(ws), 4);
});

test('live room: a smaller format hides the extra lives instead of deleting them', () => {
  const ws = workspaceForLiveRoom(feeds('a', 'b', 'c', 'd'), 'grid2');
  applyLiveRoomLayout(ws, 'single');
  assert.equal(streamCount(ws), 4);
  assert.equal(hiddenTiles(ws).length, 3);
  applyLiveRoomLayout(ws, 'grid2');
  assert.equal(hiddenTiles(ws).length, 0);
});

test('live room: the main click switches the main live, keeps priority and sound', () => {
  const ws = workspaceForLiveRoom(feeds('a', 'b'), 'liveRow');
  const id = replaceLiveRoomMain(ws, feed('c'));
  assert.equal(id, ws.tiles.find((tile) => tile.input === 'tiktoklive:c').id);
  assert.equal(streamCount(ws), 2);
  assert.equal(ws.tiles.filter((tile) => tile.input).every((tile) => Boolean(tile.primary) === (tile.input === 'tiktoklive:c')), true);
  assert.equal(ws.tiles.find((tile) => tile.input === 'tiktoklive:c').muted, false);
  assert.equal(ws.tiles.filter((tile) => tile.input && tile.input !== 'tiktoklive:c').every((tile) => tile.muted), true);

  const existing = mainLiveRoomTile(ws, ws.tiles.find((tile) => tile.input === 'tiktoklive:b').id);
  assert.equal(existing, ws.tiles.find((tile) => tile.input === 'tiktoklive:b').id);
  assert.equal(ws.tiles.find((tile) => tile.input === 'tiktoklive:b').primary, true);
  assert.equal(ws.tiles.find((tile) => tile.input === 'tiktoklive:b').muted, false);
});

test('live room: the four formats are the only ones offered', () => {
  assert.deepEqual(LIVE_ROOM_LAYOUTS.map((layout) => layout.label), ['1', '1 beside 1', '1 over 1', '2 × 2']);
});
