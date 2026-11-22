import test from 'node:test';
import assert from 'node:assert/strict';
import { searchChannels, searchLiveSources, searchMatches, searchSports } from '../src/live-search.js';

const catalog = [
  { name: 'TSN 4', url: 'https://cdn.example/tsn4.m3u8', category: 'Sports', country: 'Canada' },
  { name: 'TSN 5', url: 'https://cdn.example/tsn5.m3u8', category: 'Sports', country: 'Canada' },
  { name: 'CNN', url: 'https://cdn.example/cnn.m3u8', category: 'News', country: 'US' },
];
const zlive = [
  { name: 'TSN 4', url: 'https://zlive.st/embed/TSN4', category: 'Sports', region: 'Canada', quality: 'FHD' },
  { name: 'Sky Sports F1', url: 'https://zlive.st/embed/skysportsf1-uk2', category: 'F1', region: 'UK', quality: 'FHD' },
];

test('live channel search groups the same channel across Catalog and Zlive', () => {
  const list = searchChannels(catalog, zlive, 'TSN');
  assert.deepEqual(list.map((item) => item.label), ['TSN 4', 'TSN 5']);
  assert.deepEqual(list[0].sources.map((source) => source.label), ['Catalog', 'Zlive']);
  assert.equal(list[0].sources[0].kind, 'catalog');
  assert.equal(list[0].sources[1].kind, 'zlive');
  assert.deepEqual(searchChannels(catalog, zlive, 'T'), []);
  assert.deepEqual(searchChannels(catalog, zlive, 'cnn').map((item) => item.label), ['CNN']);
  assert.deepEqual(searchChannels([], [{ name: 'Sp*rtsNET NY', url: 'https://zlive.st/embed/sportsnet-ny' }], 'TSN'), []);
});

test('channel grouping ignores spacing and punctuation differences', () => {
  const list = searchChannels(
    [{ name: 'TSN4', url: 'https://cdn.example/tsn4-catalog.m3u8', category: 'Sports' }],
    [{ name: 'TSN 4', url: 'https://zlive.st/embed/TSN4', category: 'Sports' }],
    'tsn 4',
  );
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].sources.map((source) => source.label), ['Catalog', 'Zlive']);
});

test('live match search puts live ahead of upcoming and keeps the source', () => {
  const daddy = [{ id: 'd1', name: 'Collision #171', category: 'Fighting', source: 'Matchora', channels: [{ name: 'TNT' }] }];
  const ppv = [{ name: 'Grand Prix', category: 'Motorsport', tag: 'F1', source: 'PPV', input: 'https://ppv.test/1', live: false, upcoming: true, starts: Date.now() + 3600000 }];
  const matchora = [
    { id: 'm1', name: 'Las Vegas Grand Prix', league: 'Formula 1', sport: 'Motorsport', live: true, score: 'Lap 10', channels: [{ name: 'Sky Sports F1' }], starts: Date.now() - 1000 },
    { id: 'm2', name: 'Las Vegas Grand Prix Qualifying', league: 'Formula 1', sport: 'Motorsport', live: false, channels: [], starts: Date.now() + 7200000 },
  ];
  const list = searchMatches({ daddy, ppv, matchora }, 'grand prix');
  assert.equal(list[0].label, 'Las Vegas Grand Prix');
  assert.equal(list[0].source, 'matchora');
  assert.equal(list[0].live, true);
  assert.ok(list.some((item) => item.source === 'ppv'));
  assert.ok(list.some((item) => item.source === 'daddy') === false);
  assert.equal(searchMatches({ daddy, ppv, matchora }, 'collision')[0].source, 'daddy');
  const upcoming = searchMatches({ daddy: [], ppv: [], matchora }, 'las vegas qualifying')[0];
  assert.match(upcoming.sub, /Tomorrow|Today|Nov/);
});

test('sports search ranks live games first and can match the channel', () => {
  const sports = [
    { label: 'Man United vs Fulham', meta: 'Final · Wed, Nov 19', state: 'post', live: false, starts: 1, channel: null },
    { label: 'Raptors vs Celtics', meta: 'Live · 3rd', state: 'in', live: true, starts: 2, channel: { name: 'TSN 4' } },
  ];
  assert.deepEqual(searchSports(sports, 'tsn').map((item) => item.label), ['Raptors vs Celtics']);
  assert.deepEqual(searchSports(sports, 'man united').map((item) => item.label), ['Man United vs Fulham']);
  assert.deepEqual(searchSports(sports, 'r'), []);
});

test('sports search finds a team by its full name and puts the next game before a final', () => {
  const sports = [
    { label: 'Liverpool vs Man Utd', meta: 'Today 11:30 am', state: 'pre', live: false, starts: 3, aliases: ['Manchester United', 'Man Utd'] },
    { label: 'Man Utd vs Aston Villa', meta: 'Final · Sun, Nov 8', state: 'post', live: false, starts: 1, aliases: ['Manchester United', 'Man Utd'] },
  ];
  assert.deepEqual(searchSports(sports, 'manchester united').map((item) => item.label), ['Liverpool vs Man Utd', 'Man Utd vs Aston Villa']);
  assert.deepEqual(searchSports(sports, 'toronto'), []);
});

test('channel sources keep their own feed names for the picker', () => {
  const list = searchChannels([], [
    { id: 'TSN4', name: 'TSN 4', url: 'https://zlive.st/embed/TSN4', category: 'Sports', quality: 'FHD' },
    { id: 'auto-tsn4', name: 'TSN4', url: 'https://zlive.st/embed/auto-tsn4', category: 'Sports', quality: 'FHD' },
  ], 'TSN 4');
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].sources.map((source) => source.name), ['TSN 4', 'TSN4']);
  assert.deepEqual(list[0].sources.map((source) => source.label), ['Zlive', 'Zlive']);
});

test('one search returns every live group and does no work for one letter', () => {
  const data = { catalog, zlive, daddy: [], ppv: [], matchora: [], sports: [] };
  assert.deepEqual(searchLiveSources(data, 'T'), { channels: [], matches: [], sports: [], games: [] });
  const result = searchLiveSources(data, 'TSN');
  assert.equal(result.channels.length, 2);
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.sports, []);
  assert.deepEqual(result.games, []);
});
