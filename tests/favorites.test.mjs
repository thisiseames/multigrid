import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
};

const {
  deleteFolder, favoriteName, favoriteSources, findSaved, folderForCategory, isFolderClosed, listFavorites, listFolders,
  openSaved, promoteFavoriteSource, removeFavorite, removeFavoriteSource, renameFolder,
  saveCurrent, saveFavorite, saveNamed, setFolderClosed,
} = await import('../src/storage.js');

beforeEach(() => store.clear());

test('a favorite saved before folders existed keeps working, outside any folder', () => {
  store.set('multigrid.favorites.v1', JSON.stringify([{ input: 'a', name: 'FOX - PPV' }]));
  assert.deepEqual(listFavorites(), [{ input: 'a', name: 'FOX - PPV', group: '' }]);
  assert.equal(favoriteName('a'), 'FOX - PPV');
  assert.deepEqual(listFolders(), []);
});

test('new favorites go first, and editing one keeps its place', () => {
  saveFavorite('a', 'A');
  saveFavorite('b', 'B');
  saveFavorite('a', 'A2', 'News');
  assert.deepEqual(listFavorites().map((item) => item.name), ['B', 'A2']);
  assert.equal(listFavorites()[1].group, 'News');
});

test('folders are A to Z, and news and News are the same folder', () => {
  saveFavorite('a', 'A', 'Sports');
  saveFavorite('b', 'B', 'News');
  saveFavorite('c', 'C', '  news ');
  assert.deepEqual(listFolders(), ['News', 'Sports']);
  assert.equal(listFavorites()[0].group, 'News');
});

test('an event poster stays with its favorite and survives a rename', () => {
  saveFavorite('a', 'Event', 'PPV', undefined, 'https://img.test/poster.jpg');
  assert.equal(listFavorites()[0].poster, 'https://img.test/poster.jpg');
  saveFavorite('a', 'Event renamed', 'PPV');
  assert.equal(listFavorites()[0].poster, 'https://img.test/poster.jpg');
  saveFavorite('a', 'Event renamed', 'PPV', undefined, '');
  assert.equal('poster' in listFavorites()[0], false);
});

test('a folder disappears with its last favorite', () => {
  saveFavorite('a', 'A', 'News');
  removeFavorite('a');
  assert.deepEqual(listFolders(), []);
});

test('moving a favorite out of a folder', () => {
  saveFavorite('a', 'A', 'News');
  saveFavorite('a', 'A', '');
  assert.equal(listFavorites()[0].group, '');
  assert.deepEqual(listFolders(), []);
});

test('renaming a folder moves everything in it and leaves others alone', () => {
  saveFavorite('a', 'A', 'News');
  saveFavorite('b', 'B', 'news');
  saveFavorite('c', 'C', 'Sports');
  saveFavorite('d', 'D');
  renameFolder('News', 'World');
  assert.deepEqual(listFolders(), ['Sports', 'World']);
  assert.deepEqual(listFavorites().map((item) => item.group).sort(), ['', 'Sports', 'World', 'World']);
});

test('renaming onto another folder puts the two together', () => {
  saveFavorite('a', 'A', 'News');
  saveFavorite('b', 'B', 'Sports');
  renameFolder('News', 'sports');
  assert.deepEqual(listFolders(), ['Sports']);
});

test('changing only the capitals of a folder works', () => {
  saveFavorite('a', 'A', 'news');
  renameFolder('news', 'NEWS');
  assert.deepEqual(listFolders(), ['NEWS']);
});

test('a blank folder name changes nothing', () => {
  saveFavorite('a', 'A', 'News');
  assert.equal(renameFolder('News', '   '), false);
  assert.deepEqual(listFolders(), ['News']);
});

test('a finder channel joins the category folder that exists, and stays unfiled otherwise', () => {
  saveFavorite('a', 'A', 'NEWS');
  saveFavorite('b', 'B', 'SPORTS');
  saveFavorite('c', 'C', 'ENTERTAINMENT');
  assert.equal(folderForCategory('News'), 'NEWS');
  assert.equal(folderForCategory('sports'), 'SPORTS');
  assert.equal(folderForCategory('Entertainment'), 'ENTERTAINMENT');
  assert.equal(folderForCategory('Movies'), '');
  assert.equal(folderForCategory('General'), '');
  assert.equal(folderForCategory(''), '');

  saveFavorite('d', 'D', folderForCategory('News'));
  saveFavorite('e', 'E', folderForCategory('Movies'));
  assert.equal(listFavorites().find((item) => item.input === 'd').group, 'NEWS');
  assert.equal(listFavorites().find((item) => item.input === 'e').group, '');
  assert.equal(listFavorites().find((item) => item.input === 'a').group, 'NEWS');
  assert.deepEqual(listFolders(), ['ENTERTAINMENT', 'NEWS', 'SPORTS']);
});

test('a closed folder stays closed, follows a rename, and opens when something is saved into it', () => {
  saveFavorite('a', 'A', 'News');
  setFolderClosed('News', true);
  assert.equal(isFolderClosed('news'), true);
  renameFolder('News', 'World');
  assert.equal(isFolderClosed('World'), true);
  assert.equal(isFolderClosed('News'), false);
  saveFavorite('b', 'B', 'world');
  assert.equal(isFolderClosed('World'), false);
});

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const inline = page.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

test('the security rule in the page allows its own start-up script, or the app is a blank screen', () => {
  const hash = createHash('sha256').update(inline).digest('base64');
  assert.ok(page.includes(`'sha256-${hash}'`), `expected 'sha256-${hash}' in the page's security rule`);
});

test('the latest-file check covers every source file', () => {
  const listed = JSON.parse(inline.match(/const files = (\[.*?\]);/)[1].replaceAll("'", '"'));
  const sources = readdirSync(new URL('../src/', import.meta.url)).filter((file) => file.endsWith('.js') && !file.startsWith('._'));
  assert.deepEqual(listed.filter((file) => file.startsWith('src/')).sort(), sources.map((file) => `src/${file}`).sort());
  assert.ok(listed.includes('index.html') && listed.includes('styles.css'));
});

const { loadCurrent } = await import('../src/storage.js');
const { emptyWorkspace } = await import('../src/layout.js');

test('a stream saved before volumes existed starts at full level, and odd levels are tidied', () => {
  const ws = emptyWorkspace();
  ws.tiles.push({ id: 't', input: 'https://example.com/a', muted: true, volume: 40, place: null });
  saveCurrent(ws);
  assert.equal(loadCurrent().tiles[0].volume, 40);
  const raw = JSON.parse(store.get('multigrid.current.v1'));
  delete raw.tiles[0].volume;
  store.set('multigrid.current.v1', JSON.stringify(raw));
  assert.equal(loadCurrent().tiles[0].volume, 100);
  raw.tiles[0].volume = 900;
  store.set('multigrid.current.v1', JSON.stringify(raw));
  assert.equal(loadCurrent().tiles[0].volume, 100);
});

test('favorites travel through a link and come back the same, without files from this computer', async () => {
  const { packFavorites, transferableFavorites, unpackFavorites } = await import('../src/storage.js');
  saveFavorite('https://example.com/embed/cnn', 'CNN', 'News');
  saveFavorite('<iframe src="https://example.com/sky?x=1&y=é"></iframe>', 'Sky Sports 1', 'Sports');
  saveFavorite('https://youtube.com/watch?v=abc', 'Loose');
  saveFavorite('local:abc123:clip.mp4', 'My clip');
  saveFavorite('podcastshow:1439621628', 'Front Burner');
  const { items, left } = transferableFavorites();
  assert.equal(left, 1);
  assert.equal(items.some((item) => item.input.startsWith('podcastshow:')), false);
  const code = await packFavorites(items);
  assert.match(code, /^[\w-]+$/);
  assert.deepEqual(await unpackFavorites(code), items);
});

test('a damaged or made-up favorites link gives nothing', async () => {
  const { unpackFavorites } = await import('../src/storage.js');
  assert.equal(await unpackFavorites('not-a-real-code'), null);
  assert.equal(await unpackFavorites(''), null);
});

test('importing adds only what is new, keeps names here, and joins folders whatever the capitals', async () => {
  const { importFavorites, newFavorites } = await import('../src/storage.js');
  saveFavorite('a', 'A here', 'News');
  const incoming = [
    { input: 'a', name: 'A there', group: 'news' },
    { input: 'b', name: 'B', group: 'news' },
    { input: 'c', name: 'C', group: 'Sports' },
    { input: 'c', name: 'C twice', group: 'Sports' },
  ];
  assert.equal(newFavorites(incoming).length, 2);
  assert.equal(importFavorites(incoming), 2);
  assert.equal(favoriteName('a'), 'A here');
  assert.deepEqual(listFolders(), ['News', 'Sports']);
  assert.equal(listFavorites().find((item) => item.input === 'b').group, 'News');
  assert.equal(importFavorites(incoming), 0);
  assert.equal(listFavorites().length, 3);
});

test('a favourite keeps a channel logo, including when it is renamed', () => {
  saveFavorite('logo', 'Channel', 'Sports', 'https://example.com/logo.png');
  assert.equal(listFavorites().find((item) => item.input === 'logo').logo, 'https://example.com/logo.png');
  saveFavorite('logo', 'Renamed', 'Sports');
  assert.equal(listFavorites().find((item) => item.input === 'logo').logo, 'https://example.com/logo.png');
  saveFavorite('plain', 'No logo');
  assert.equal('logo' in listFavorites().find((item) => item.input === 'plain'), false);
});

test('a tile title is kept with the workspace', () => {
  saveCurrent({
    v: 1, presetId: 'equal', minSlots: 0, started: true, fit: true,
    cols: [1], rows: [1],
    tiles: [{ input: 'https://www.youtube.com/watch?v=abcdefghijk', muted: true, volume: 100, place: { c: 0, r: 0, cs: 1, rs: 1 }, title: 'A real video title' }],
  });
  assert.equal(loadCurrent().tiles[0].title, 'A real video title');
});

test("a series tile remembers the episode it moved on to, but only for its own link", () => {
  const series = 'https://atlantic.example/watch/247718/1/1';
  const ws = emptyWorkspace();
  ws.tiles.push(
    { id: 'a', input: series, muted: true, volume: 100, place: null, page: { for: series, href: 'https://atlantic.example/watch/247718/2/8' } },
    // The tile was changed to another stream since: its old page is dropped.
    { id: 'b', input: 'https://other.example/live', muted: true, volume: 100, place: null, page: { for: series, href: 'https://atlantic.example/watch/247718/2/8' } },
    // Another site entirely, such as an ad: never kept.
    { id: 'c', input: series, muted: true, volume: 100, place: null, page: { for: series, href: 'https://ads.example/win' } });
  saveCurrent(ws);
  const [a, b, c] = loadCurrent().tiles;
  assert.deepEqual(a.page, { for: series, href: 'https://atlantic.example/watch/247718/2/8' });
  assert.equal(a.input, series);
  assert.equal(b.page, undefined);
  assert.equal(c.page, undefined);
});

test('a favorite keeps same-channel backups and promotes a repaired link', () => {
  store.set('multigrid.favorites.v1', JSON.stringify([{
    input: 'https://zlive.st/embed/TSN4', name: 'TSN 4', group: 'Sports',
    sources: [{ input: 'https://old.test/tsn4', name: 'TSN 4' }, { input: 'https://old.test/tsn4', name: 'duplicate' }],
  }]));
  assert.deepEqual(favoriteSources('https://zlive.st/embed/TSN4'), [{ input: 'https://old.test/tsn4', name: 'TSN 4' }]);
  assert.equal(promoteFavoriteSource('https://zlive.st/embed/TSN4', 'https://new.test/tsn4'), true);
  const item = listFavorites()[0];
  assert.equal(item.input, 'https://new.test/tsn4');
  assert.equal(item.name, 'TSN 4');
  assert.deepEqual(item.sources, [
    { input: 'https://zlive.st/embed/TSN4', name: 'TSN 4' },
    { input: 'https://old.test/tsn4', name: 'TSN 4' },
  ]);
  assert.equal(removeFavoriteSource(item.input, 'https://old.test/tsn4'), true);
  assert.deepEqual(favoriteSources(item.input), [{ input: 'https://zlive.st/embed/TSN4', name: 'TSN 4' }]);
});

test('backups are capped at six and survive a normal edit', () => {
  const sources = Array.from({ length: 8 }, (_, index) => ({ input: `https://s.test/${index}`, name: `Feed ${index}` }));
  store.set('multigrid.favorites.v1', JSON.stringify([{ input: 'a', name: 'A', sources }]));
  assert.equal(listFavorites()[0].sources.length, 6);
  saveFavorite('a', 'A renamed', 'News');
  assert.equal(listFavorites()[0].sources.length, 6);
});

test('the current wall keeps a game link and a saved layout drops it', () => {
  const event = { key: 'sports:1', label: 'Liverpool vs Man Utd', starts: Date.now() + 3600000 };
  const ws = {
    v: 1, presetId: 'single', minSlots: 0, started: true, fit: true, cols: [1], rows: [1],
    tiles: [{
      id: 't', input: 'https://a.test/1', muted: true, volume: 100, place: { c: 0, r: 0, cs: 1, rs: 1 },
      event, sources: [{ input: 'https://b.test/1', name: 'Sky Sports' }],
    }],
  };
  saveCurrent(ws);
  const current = loadCurrent();
  assert.deepEqual(current.tiles[0].event, event);
  assert.deepEqual(current.tiles[0].sources, [{ input: 'https://b.test/1', name: 'Sky Sports' }]);
  saveNamed('Game wall', ws);
  const saved = openSaved(findSaved('Game wall'));
  assert.equal('event' in saved.tiles[0], false);
  assert.deepEqual(saved.tiles[0].sources, [{ input: 'https://b.test/1', name: 'Sky Sports' }]);
});

test('the room marker travels with the current wall and a saved room', () => {
  const room = { key: 'sports:1', label: 'Liverpool vs Man Utd', kind: 'game', starts: 1000, ends: 0, notLive: true };
  const ws = {
    v: 1, presetId: 'row', minSlots: 0, started: true, fit: true, cols: [1, 1], rows: [1],
    room,
    tiles: [{
      id: 't', input: 'https://a.test/1', muted: false, volume: 100,
      place: { c: 0, r: 0, cs: 1, rs: 1 }, primary: true,
    }],
  };
  saveCurrent(ws);
  assert.deepEqual(loadCurrent().room, room);
  saveNamed('Room · Liverpool vs Man Utd', ws);
  assert.deepEqual(openSaved(findSaved('Room · Liverpool vs Man Utd')).room, room);
  // A layout without a room stays without one.
  const normal = { ...ws, room: undefined };
  saveCurrent(normal);
  assert.equal('room' in loadCurrent(), false);
});

test('deleting a folder removes its favorites and leaves everything else', () => {
  saveFavorite('a', 'A', 'News');
  saveFavorite('b', 'B', 'news');
  saveFavorite('c', 'C', 'Sports');
  saveFavorite('d', 'D', '');
  assert.equal(deleteFolder('NEWS'), 2);
  assert.deepEqual(listFolders(), ['Sports']);
  assert.deepEqual(listFavorites().map((item) => item.input).sort(), ['c', 'd']);
  assert.equal(deleteFolder('Missing'), 0);
  assert.equal(deleteFolder('   '), 0);
});

test('deleting a folder opens it if it was closed', () => {
  saveFavorite('a', 'A', 'News');
  setFolderClosed('News', true);
  assert.equal(isFolderClosed('News'), true);
  deleteFolder('News');
  assert.equal(isFolderClosed('News'), false);
});
