import test from 'node:test';
import assert from 'node:assert/strict';
import {
  channelKey, channelName, gameForName, gameForTile, gamesForChannel, gamesOnNow, gameLink,
  mergeGames, resolveGameSources, sameGame, sourceIdentity, sourcesForChannel, splitTeams,
} from '../src/game-links.js';

const start = Date.parse('2026-11-22T16:30:00.000Z');
const sports = [{
  id: '401', sport: 'soccer/all', league: 'Premier League', start, state: 'pre', live: false,
  home: { name: 'Liverpool', full: 'Liverpool', id: '364' },
  away: { name: 'Man Utd', full: 'Manchester United', id: '360' },
  tv: ['USA Net', 'Tele'],
}];
const matchora = [{
  id: 'm1', name: 'Liverpool vs Manchester United', league: 'English Premier League', sport: 'Soccer',
  starts: start, live: false, input: 'https://matchora.pro/embed/match/m1',
  channels: [
    { name: 'USA NETWORK EAST' }, { name: 'USA NETWORK' }, { name: 'MUTV' },
    { name: 'SKY SPORTS MAIN EVENT' }, { name: 'SKY SPORTS PREMIER LEAGUE' },
  ],
}];
const ppv = [{
  id: 7, name: 'Liverpool vs. Manchester United', tag: 'Premier League', category: 'Football',
  starts: start, live: false, upcoming: true, input: 'https://ppv.st/embed/7',
}];
const guide = [{ channel: 'Sky Sports Main Event', title: 'Live PL: Liverpool v Man Utd', start: start - 1800000, end: start + 5400000 }];
const catalog = [];
const zlive = [
  { name: 'USA Network', url: 'https://zlive.st/embed/usa-network', category: 'Sports', region: 'United States', quality: 'FHD' },
  { name: 'Sky Sports Main Event', url: 'https://zlive.st/embed/skysportsmainevent', category: 'Sports', region: 'UK', quality: 'FHD' },
  { name: 'Sky Sports Main Event Backup', url: 'https://zlive.st/embed/skysportsmainevent-backup', category: 'Sports', region: 'UK', quality: 'FHD' },
  { name: 'Sky Sports Premier League', url: 'https://zlive.st/embed/skysportspremierleague', category: 'Sports', region: 'UK', quality: 'FHD' },
  { name: 'Sky Sports Football', url: 'https://zlive.st/embed/skysportsfootball', category: 'Sports', region: 'UK', quality: 'FHD' },
];
const favorites = [
  { name: 'Sky Sports Main Event', input: 'https://zlive.st/embed/skysportsmainevent?accent=f5f5f7', group: 'Sports' },
  { name: 'USA Network', input: 'https://zlive.st/embed/usa-network?accent=f5f5f7', group: 'Sports' },
];

test('channel names collapse feeds but keep separate Sky Sports channels', () => {
  assert.equal(channelKey('USA Net'), 'usanetwork');
  assert.equal(channelKey('USA Network East'), 'usanetwork');
  assert.equal(channelKey('USANETWORK'), 'usanetwork');
  assert.equal(channelKey('Sky Sport Main Event'), 'skysportsmainevent');
  assert.equal(channelKey('Sky Sports Main Event Backup'), 'skysportsmainevent');
  assert.equal(channelName('SKY SPORTS MAIN EVENT'), 'Sky Sports Main Event');
  assert.notEqual(channelKey('Sky Sports Main Event'), channelKey('Sky Sports Premier League'));
  assert.equal(channelKey('Sky Sports+'), 'skysportsplus');
  assert.notEqual(channelKey('Sky Sports+'), channelKey('Sky Sports'));
});

test('teams split from v, vs and at', () => {
  assert.deepEqual(splitTeams('Liverpool vs Manchester United'), ['Liverpool', 'Manchester United']);
  assert.deepEqual(splitTeams('Liverpool v Man Utd'), ['Liverpool', 'Man Utd']);
  assert.deepEqual(splitTeams('Bucks at 76ers'), ['Bucks', '76ers']);
  assert.deepEqual(splitTeams('Cricket : ACC Mens Cup - United Arab Emirates vs Nepal'), ['United Arab Emirates', 'Nepal']);
  assert.deepEqual(splitTeams('NFL RedZone'), []);
});

test('the same fixture from ESPN, Matchora, PPV and the Guide becomes one game', () => {
  const games = mergeGames({ sports, matchora, ppv, guide });
  assert.equal(games.length, 1);
  const game = games[0];
  assert.equal(game.label, 'Liverpool vs Man Utd');
  assert.equal(game.starts, start);
  assert.equal(game.aliases.includes('Liverpool vs Manchester United'), true);
  assert.equal(game.channels.some((channel) => channel.key === 'usanetwork'), true);
  assert.equal(game.channels.filter((channel) => channel.key === 'usanetwork').length, 1);
  assert.equal(game.channels.some((channel) => channel.key === 'skysportsmainevent'), true);
  assert.equal(game.channels.some((channel) => channel.key === 'skysportspremierleague'), true);
  assert.equal(game.sources.some((source) => source.kind === 'matchora'), true);
  assert.equal(game.sources.some((source) => source.kind === 'ppv'), true);
  assert.equal(game.sources.some((source) => source.kind === 'sports'), false);
});

test('the same teams on different days are not merged', () => {
  const other = { ...sports[0], id: '402', start: start + 7 * 86400000 };
  const games = mergeGames({ sports: [sports[0], other] });
  assert.equal(games.length, 2);
  assert.equal(sameGame(sports[0], other), false);
});

test('a game resolves its channels to favorites and Zlive feeds', () => {
  const game = mergeGames({ sports, matchora, ppv, guide })[0];
  const sources = resolveGameSources(game, { favorites, catalog, zlive });
  const usa = sources.channels.find((channel) => channel.key === 'usanetwork');
  assert.ok(usa);
  assert.equal(usa.sources.some((source) => source.kind === 'favorite'), true);
  assert.equal(usa.sources.filter((source) => source.kind === 'zlive').length, 0);
  const sky = sources.channels.find((channel) => channel.key === 'skysportsmainevent');
  assert.ok(sky);
  assert.equal(sky.sources[0].kind, 'favorite');
  assert.equal(sky.sources.length, 2);
  assert.equal(sky.sources[1].kind, 'zlive');
  assert.equal(sources.providers.some((source) => source.kind === 'matchora'), true);
  assert.equal(sources.providers.some((source) => source.kind === 'ppv'), true);
});

test('a channel query finds the game on it, including the Sky Sports family', () => {
  const games = mergeGames({ sports, matchora, ppv, guide });
  assert.equal(gamesForChannel(games, 'Sky Sports').length, 1);
  assert.equal(gamesForChannel(games, 'Sky Sports Main Event').length, 1);
  assert.equal(gamesForChannel(games, 'USA Network').length, 1);
  assert.equal(gamesForChannel(games, 'TSN').length, 0);
});

test('a tile links by game name, a specific channel and the Guide, but not a family label', () => {
  const games = mergeGames({ sports, matchora, ppv, guide });
  assert.equal(gameForTile({ name: 'Liverpool vs Man Utd', games }).label, 'Liverpool vs Man Utd');
  assert.equal(gameForTile({ name: 'Sky Sports Main Event', games, guide }).label, 'Liverpool vs Man Utd');
  assert.equal(gameForTile({ name: 'Sky Sports', games, guide }), null);
  assert.equal(gameForName(games, 'Manchester United'), null);
});

test('a Guide-only game still appears with its channel', () => {
  const games = mergeGames({ guide: [{ channel: 'Sky Sports Football', title: 'Live EFL: Hull City v Brighton', start, end: start + 7200000 }] });
  assert.equal(games.length, 1);
  assert.equal(games[0].label, 'Hull City vs Brighton');
  assert.equal(games[0].channels[0].key, 'skysportsfootball');
});

test('games on now are live first, then the next ones', () => {
  const later = { ...sports[0], id: 'later', start: start + 3 * 3600000 };
  const live = { ...sports[0], id: 'live', start: start - 1800000, state: 'in', live: true };
  const games = mergeGames({ sports: [later, live] });
  const now = start;
  assert.equal(gamesOnNow(games, now)[0].label, 'Liverpool vs Man Utd');
  assert.equal(gamesOnNow(games, now)[0].live, true);
});

test('a game link is small and survives only while it is current', () => {
  const game = mergeGames({ sports, matchora, ppv, guide })[0];
  assert.deepEqual(gameLink(game), { key: 'sports:401', label: 'Liverpool vs Man Utd', starts: start });
  assert.equal(gameLink(null), null);
});

test('sources for one channel are deduped and capped', () => {
  const many = Array.from({ length: 10 }, (_, index) => ({ name: 'USA Network', url: `https://zlive.st/embed/usa-${index}` }));
  const sources = sourcesForChannel('USA Network', { favorites: [], catalog: [], zlive: many });
  assert.equal(sources.length, 6);
  assert.equal(new Set(sources.map((source) => source.input)).size, 6);
});

test('two games sharing one team at the same time stay separate', () => {
  const hull = { ...sports[0], id: 'hull', home: { name: 'Hull', full: 'Hull City' }, away: { name: 'Brighton', full: 'Brighton & Hove Albion' } };
  const everton = { ...sports[0], id: 'everton', home: { name: 'Everton', full: 'Everton' }, away: { name: 'Brighton', full: 'Brighton & Hove Albion' } };
  assert.equal(sameGame(hull, everton), false);
  assert.equal(mergeGames({ sports: [hull, everton] }).length, 2);
});

test('a Daddy Live hyphen name merges but its link names are not TV channels', () => {
  const hull = { ...sports[0], id: 'hull', home: { name: 'Hull', full: 'Hull City' }, away: { name: 'Brighton', full: 'Brighton & Hove Albion' } };
  const daddy = [{
    name: 'England Premier League: Hull City - Brighton & Hove Albion', category: 'Football', live: true,
    channels: [{ name: 'Link 1', url: 'https://daddylive.app/player/embed.php?1' }],
  }];
  const games = mergeGames({ sports: [hull], daddy });
  assert.equal(games.length, 1);
  assert.equal(games[0].sources.some((source) => source.kind === 'daddy'), true);
  assert.equal(games[0].channels.some((channel) => channel.key === 'link1'), false);
});

test('a Zlive manifest URL and its clean player URL count as one source', () => {
  assert.equal(
    sourceIdentity({ input: 'https://zlive.st/embed/auto-usa-network?accent=f5f5f7' }),
    sourceIdentity({ input: 'https://zlive.st/embed/auto-usa-network' }),
  );
  assert.notEqual(
    sourceIdentity({ input: 'https://zlive.st/embed/auto-usa-network' }),
    sourceIdentity({ input: 'https://zlive.st/embed/auto-usa-network-backup' }),
  );
});
