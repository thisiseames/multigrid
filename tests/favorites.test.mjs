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
