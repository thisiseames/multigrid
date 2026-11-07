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
  favoriteName, isFolderClosed, listFavorites, listFolders, removeFavorite, renameFolder, saveFavorite, setFolderClosed,
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

const { loadCurrent, saveCurrent } = await import('../src/storage.js');
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
  const { items, left } = transferableFavorites();
  assert.equal(left, 1);
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
