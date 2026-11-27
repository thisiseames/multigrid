import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pack = JSON.parse(readFileSync(new URL('../music-pack.json', import.meta.url), 'utf8'));
const artists = pack.items.filter((item) => !item.name.includes(' · '));
const albums = pack.items.filter((item) => item.name.includes(' · '));

test('the Music pack has every artist, album and cover', () => {
  assert.equal(artists.length, 14);
  assert.equal(albums.length, 113);
  assert.equal(pack.items.length, 127);
  assert.deepEqual([...new Set(pack.items.map((item) => item.input))].length, pack.items.length);
  assert.deepEqual(artists.map((item) => item.name), [
    'KANYE WEST', 'BAD BUNNY', 'FALL OUT BOY', 'TORY LANEZ', 'YUNG BLEU', 'NICKELBACK',
    'THE WEEKND', 'VEGEDREAM', 'CHILDISH GAMBINO', 'MICHAEL JACKSON', 'LIL WAYNE', 'AKON',
    'MORGAN WALLEN', 'YOUNG DOLPH',
  ]);
  const names = new Set(artists.map((item) => item.name));
  for (const artist of artists) {
    assert.equal(artist.group, 'MUSIC');
    assert.match(artist.input, /^https:\/\/www\.youtube\.com\/channel\/UC[\w-]{22}\/videos$/);
    assert.match(artist.poster, /^https:\/\/yt3\.googleusercontent\.com\//);
  }
  for (const album of albums) {
    const artist = album.name.split(' · ')[0];
    assert.equal(album.group, 'MUSIC');
    assert.ok(names.has(artist), album.name);
    assert.match(album.input, /^https:\/\/music\.youtube\.com\/playlist\?list=OLAK5uy_/);
    assert.match(album.poster, /^https:\/\/yt3\.googleusercontent\.com\//);
  }
});
