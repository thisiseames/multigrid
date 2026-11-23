import test from 'node:test';
import assert from 'node:assert/strict';
import { roomForGame, roomForShow, roomForTile, roomMeta, roomName, workspaceForRoom } from '../src/rooms.js';

const fav = (name, input) => ({ name, input });
const game = {
  key: 'sports:1',
  label: 'Liverpool vs Man Utd',
  teams: ['Liverpool', 'Manchester United'],
  starts: 1000,
  live: true,
  channels: [
    { key: 'skysportsmainevent', name: 'Sky Sports Main Event' },
    { key: 'usanetwork', name: 'USA Network' },
    { key: 'skysportspremierleague', name: 'Sky Sports Premier League' },
    { key: 'canalplusextra', name: 'CANAL+ Extra' },
    { key: 'telemundo', name: 'Telemundo' },
  ],
  sources: [],
};

const data = {
  games: [game],
  guide: [],
  catalog: [],
  zlive: [],
};

const favorites = [
  fav('Sky Sports Main Event', 'https://sky.test/main'),
  fav('USA Network', 'https://usa.test/live'),
  fav('Sky Sports Premier League', 'https://sky.test/pl'),
  fav('CANAL+ Extra', 'https://canal.test/extra'),
  fav('Telemundo', 'https://telemundo.test/live'),
];

test('a game room: favourite feeds first, the opened feed is main, four at most', () => {
  const room = roomForGame(game, data, { favorites, tiles: [], mainInput: 'https://usa.test/live' });
  assert.equal(room.kind, 'game');
  assert.equal(room.label, 'Liverpool vs Man Utd');
  assert.equal(room.key, 'sports:1');
  assert.equal(room.feeds.length, 4);
  assert.deepEqual(room.feeds.map((feed) => feed.name), ['USA Network', 'CANAL+ Extra', 'Sky Sports Main Event', 'Sky Sports Premier League']);
  assert.equal(room.feeds[0].input, 'https://usa.test/live');
  assert.deepEqual(roomMeta(room), { key: 'sports:1', label: 'Liverpool vs Man Utd', kind: 'game', starts: 1000, ends: 0 });
  assert.equal(roomName(room), 'Room · Liverpool vs Man Utd');
});

test('a game room includes feeds already on the wall, without duplicates', () => {
  const room = roomForGame(game, data, {
    favorites: favorites.slice(0, 2),
    tiles: [
      { input: 'https://matchora.test/one', event: { key: 'sports:1', label: game.label, starts: 1000 }, title: 'Matchora' },
      { input: 'https://usa.test/live', event: { key: 'sports:1', label: game.label, starts: 1000 }, title: 'USA' },
    ],
    mainInput: 'https://matchora.test/one',
  });
  assert.deepEqual(room.feeds.map((feed) => feed.name), ['Matchora', 'Sky Sports Main Event', 'USA Network']);
});

test('one feed is not a room', () => {
  assert.equal(roomForGame(game, data, { favorites: [favorites[0]], tiles: [] }), null);
});

test('wall feeds join by their channel even before they are linked to the game', () => {
  const room = roomForGame(game, data, {
    favorites: [],
    tiles: [
      { input: 'https://usa.test/live', title: 'USA Network' },
      { input: 'https://telemundo.test/live', title: 'Telemundo' },
    ],
    mainInput: 'https://telemundo.test/live',
  });
  assert.deepEqual(room.feeds.map((feed) => feed.name), ['Telemundo', 'USA Network']);
});

test('a show room: exact Guide title and overlapping time only', () => {
  const rows = [
    { channel: 'CNN', title: 'US Election 2026', start: 1000, end: 2000 },
    { channel: 'BBC News', title: 'US Election 2026', start: 1100, end: 2100 },
    { channel: 'Sky News', title: 'US Election 2026', start: 900, end: 1900 },
    { channel: 'CP24', title: 'US Election 2026', start: 3000, end: 4000 },
    { channel: 'CBC', title: 'The National', start: 1000, end: 2000 },
  ];
  const showFavorites = [fav('CNN', 'https://cnn.test/live'), fav('BBC News', 'https://bbc.test/live'), fav('Sky News', 'https://sky.test/live')];
  const showData = { games: [], guide: rows, catalog: [], zlive: [] };
  const room = roomForShow(rows[0], showData, { favorites: showFavorites, tiles: [], mainInput: 'https://bbc.test/live' });
  assert.equal(room.kind, 'show');
  assert.equal(room.label, 'US Election 2026');
  assert.deepEqual(room.feeds.map((feed) => feed.name), ['BBC News', 'CNN', 'Sky News']);
  assert.equal(room.feeds.length, 3);
  assert.equal(room.key, 'show:us election 2026:1000');
  assert.equal(roomMeta(room).ends, 2000);
});

test('a tile finds a linked game first, then the Guide show', () => {
  const byGame = roomForTile({
    name: 'Sky Sports Main Event', input: 'https://sky.test/main', event: { key: 'sports:1', label: game.label, starts: 1000 },
    tiles: [], favorites, data,
  });
  assert.equal(byGame.kind, 'game');

  const showData = { games: [], guide: [
    { channel: 'CNN', title: 'US Election 2026', start: 1000, end: 2000 },
    { channel: 'BBC News', title: 'US Election 2026', start: 1100, end: 2100 },
  ], catalog: [], zlive: [] };
  const byShow = roomForTile({
    name: 'CNN', input: 'https://cnn.test/live', title: 'US Election 2026',
    tiles: [], favorites: [fav('CNN', 'https://cnn.test/live'), fav('BBC News', 'https://bbc.test/live')], data: showData,
  });
  assert.equal(byShow.kind, 'show');
  assert.deepEqual(byShow.feeds.map((feed) => feed.name), ['CNN', 'BBC News']);
});

test('the room workspace: main first, one sound, the right shape, room meta saved', () => {
  const room = roomForGame(game, data, { favorites, tiles: [], mainInput: 'https://usa.test/live' });
  const three = workspaceForRoom({ ...room, feeds: room.feeds.slice(0, 3) });
  assert.equal(three.presetId, 'trio');
  assert.equal(three.room.key, 'sports:1');
  assert.equal(three.tiles.length, 3);
  assert.equal(three.tiles[0].primary, true);
  assert.equal(three.tiles[0].muted, false);
  assert.equal(three.tiles[0].title, 'USA Network');
  assert.ok(three.tiles.slice(1).every((tile) => tile.muted === true));
  assert.equal(three.tiles[0].event.key, 'sports:1');

  const two = workspaceForRoom({ ...room, feeds: room.feeds.slice(0, 2) });
  assert.equal(two.presetId, 'row');
  const four = workspaceForRoom(room);
  assert.equal(four.presetId, 'focus');
});

test('a Zlive feed is opened through its clean player', () => {
  const room = roomForGame(game, { ...data, zlive: [{ name: 'Sky Sports Main Event', url: 'https://zlive.st/embed/sky-sports-main-event' }] }, {
    favorites: [fav('USA Network', 'https://usa.test/live')], tiles: [],
  });
  const ws = workspaceForRoom(room);
  const zliveTile = ws.tiles.find((tile) => tile.input.includes('zlive.st'));
  assert.ok(zliveTile.input.includes('accent=f5f5f7'));
  assert.ok(zliveTile.input.includes('frame=0'));
});
