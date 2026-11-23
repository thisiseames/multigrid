// Event Rooms: one event, every feed MULTIGRID can find for it. Pure finding and workspace
// building; the page supplies the merged games, Guide rows and favourites.

import {
  channelFromInput, channelKey, gameForName, gameForTile, gameLink, resolveGameSources, sameGame, sourcesForChannel,
} from './game-links.js';
import { applyPreset, emptyWorkspace, uid } from './layout.js';
import { zliveEmbed } from './zlive.js';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
/** A show title for matching: no punctuation or leading article, but years stay in. */
const showKey = (value) => clean(value)
  .toLocaleLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/^(the|a|an) /, '')
  .trim();
const MAX_FEEDS = 4;

/** Move the feed the room was opened from to the front, so it is the main picture. */
function orderFeeds(feeds, mainInput) {
  const wanted = clean(mainInput);
  const at = wanted ? feeds.findIndex((feed) => feed.input === wanted) : -1;
  if (at < 1) return feeds;
  return [feeds[at], ...feeds.slice(0, at), ...feeds.slice(at + 1)];
}

function feedOf(source, name, seen, feeds) {
  const input = clean(source?.input);
  if (!input || seen.has(input)) return;
  seen.add(input);
  feeds.push({ input, kind: clean(source?.kind), name: clean(name || source?.name || source?.label) || 'Feed' });
}

/** Every playable feed for one game: favourite channels first, then other channels/providers. */
export function roomForGame(game, data = {}, { favorites = [], tiles = [], mainInput = '' } = {}) {
  if (!game?.key) return null;
  const resolved = resolveGameSources(game, {
    favorites,
    catalog: Array.isArray(data.catalog) ? data.catalog : [],
    zlive: Array.isArray(data.zlive) ? data.zlive : [],
  });
  const seen = new Set();
  const feeds = [];
  const channelKeys = new Set(resolved.channels.map((channel) => channel.key));
  const channels = [...resolved.channels].sort((a, b) => {
    const fav = (channel) => (channel.sources ?? []).some((source) => source.kind === 'favorite') ? 0 : 1;
    return fav(a) - fav(b) || a.name.localeCompare(b.name);
  });
  for (const channel of channels) {
    const source = (channel.sources ?? []).find((item) => item.input);
    if (source) feedOf(source, channel.name, seen, feeds);
  }
  for (const source of resolved.providers ?? []) feedOf(source, source.label || source.name, seen, feeds);
  for (const tile of Array.isArray(tiles) ? tiles : []) {
    if (!tile?.input) continue;
    const channel = channelFromInput(tile.input, {
      catalog: Array.isArray(data.catalog) ? data.catalog : [],
      zlive: Array.isArray(data.zlive) ? data.zlive : [],
    }) || tile.title || tile.name || '';
    const linked = tile.event && sameGame(tile.event, game);
    if (!linked && !channelKeys.has(channelKey(channel))) continue;
    feedOf({ input: tile.input, kind: 'tile' }, channel || 'Feed', seen, feeds);
  }
  if (feeds.length < 2) return null;
  return {
    key: game.key,
    label: game.label,
    kind: 'game',
    starts: Number(game.starts) || 0,
    ends: 0,
    event: gameLink(game),
    feeds: orderFeeds(feeds, mainInput).slice(0, MAX_FEEDS),
  };
}

/** Every playable favourite channel showing the same current Guide title at the same time. */
export function roomForShow(show, data = {}, { favorites = [], tiles = [], mainInput = '' } = {}) {
  if (!show?.title || !Number.isFinite(Number(show.start)) || !Number.isFinite(Number(show.end))) return null;
  const wanted = showKey(show.title);
  if (!wanted) return null;
  const rows = (Array.isArray(data.guide) ? data.guide : [])
    .filter((row) => showKey(row?.title) === wanted
      && Number(row.start) < Number(show.end)
      && Number(row.end) > Number(show.start));
  if (!rows.includes(show)) rows.unshift(show);
  const seen = new Set();
  const feeds = [];
  for (const row of rows) {
    const source = sourcesForChannel(row.channel, {
      favorites,
      catalog: Array.isArray(data.catalog) ? data.catalog : [],
      zlive: Array.isArray(data.zlive) ? data.zlive : [],
    }).find((item) => item.input);
    if (source) feedOf(source, row.channel, seen, feeds);
  }
  for (const tile of Array.isArray(tiles) ? tiles : []) {
    if (!tile?.input || showKey(tile.title) !== wanted) continue;
    feedOf({ input: tile.input, kind: 'tile' }, tile.title || 'Feed', seen, feeds);
  }
  if (feeds.length < 2) return null;
  return {
    key: `show:${wanted}:${Number(show.start)}`,
    label: show.title,
    kind: 'show',
    starts: Number(show.start) || 0,
    ends: Number(show.end) || 0,
    feeds: orderFeeds(feeds, mainInput).slice(0, MAX_FEEDS),
  };
}

/** The room for a tile: its linked game first, then a game it is showing, then the Guide. */
export function roomForTile({ name = '', input = '', title = '', event = null, tiles = [], favorites = [], data = {} } = {}) {
  const games = Array.isArray(data.games) ? data.games : [];
  const guide = Array.isArray(data.guide) ? data.guide : [];
  let game = null;
  if (event?.key) game = games.find((candidate) => candidate.key === event.key) ?? null;
  if (!game && event) game = games.find((candidate) => sameGame(candidate, event)) ?? gameForName(games, event.label);
  if (!game) {
    game = gameForTile({
      name,
      input,
      games,
      guide,
      catalog: Array.isArray(data.catalog) ? data.catalog : [],
      zlive: Array.isArray(data.zlive) ? data.zlive : [],
    });
  }
  if (game) return roomForGame(game, data, { favorites, tiles, mainInput: input });
  const channel = channelFromInput(input, {
    catalog: Array.isArray(data.catalog) ? data.catalog : [],
    zlive: Array.isArray(data.zlive) ? data.zlive : [],
  }) || name;
  const row = guide.find((candidate) => channelKey(candidate?.channel) === channelKey(channel));
  return row ? roomForShow(row, data, { favorites, tiles, mainInput: input }) : null;
}

/** The small, saveable part of a room: what it is and when, not the feeds themselves. */
export function roomMeta(room) {
  if (!room?.key || !room?.label) return null;
  return {
    key: clean(room.key).slice(0, 200),
    label: clean(room.label).slice(0, 120),
    kind: room.kind === 'show' ? 'show' : 'game',
    starts: Number(room.starts) || 0,
    ends: Number(room.ends) || 0,
    ...(room.notLive === true ? { notLive: true } : {}),
  };
}

export const roomName = (room) => `Room · ${clean(room?.label) || 'Event'}`;

const roomPreset = (count, wanted) => {
  if (wanted === 'row') return 'row';
  if (wanted === 'trio' && count === 3) return 'trio';
  if (wanted === 'focus' && count >= 4) return 'focus';
  return count <= 2 ? 'row' : count === 3 ? 'trio' : 'focus';
};

/** The workspace a room opens: two to four feeds, main first, with the room meta attached. */
export function workspaceForRoom(room, { presetId = '' } = {}) {
  const next = emptyWorkspace();
  const feeds = (Array.isArray(room?.feeds) ? room.feeds : []).slice(0, MAX_FEEDS);
  next.tiles = feeds.map((feed, index) => ({
    id: uid(),
    input: feed.kind === 'zlive' ? zliveEmbed(feed.input) : feed.input,
    title: feed.name,
    muted: index > 0,
    volume: 100,
    place: null,
    ...(index === 0 ? { primary: true } : {}),
    ...(room?.kind === 'game' && room?.event ? { event: room.event } : {}),
  }));
  applyPreset(next, roomPreset(feeds.length, presetId));
  next.room = roomMeta(room);
  return next;
}
