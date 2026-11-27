import test from 'node:test';
import assert from 'node:assert/strict';
import { musicAlbumTitle, musicArtistGroups } from '../src/music.js';

const artist = (name, id) => ({ input: `https://www.youtube.com/channel/${id}`, name, group: 'MUSIC' });
const album = (name, list) => ({ input: `https://www.youtube.com/playlist?list=${list}`, name, group: 'MUSIC' });

test('a MUSIC folder groups the artist channel with its prefixed albums', () => {
  const groups = musicArtistGroups([
    artist('DRAKE', 'UCaaaaaaaaaaaaaaaaaaaaaa'),
    album('DRAKE · TAKE CARE', 'PLtakecare'),
    album('DRAKE · NOTHING WAS THE SAME', 'PLnwts'),
    artist('EMINEM', 'UCbbbbbbbbbbbbbbbbbbbbbb'),
    album('EMINEM · THE MARSHALL MATHERS LP', 'PLmmlp'),
    { input: 'https://example.com/radio', name: 'DRAKE · RADIO', group: 'MUSIC' },
    { input: 'https://www.youtube.com/playlist?list=PLsolo', name: 'SOLO', group: 'MUSIC' },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].channel.name, 'DRAKE');
  assert.deepEqual(groups[0].albums.map((item) => item.name), ['DRAKE · TAKE CARE', 'DRAKE · NOTHING WAS THE SAME']);
  assert.equal(groups[1].channel.name, 'EMINEM');
  assert.deepEqual(groups[1].albums.map((item) => item.name), ['EMINEM · THE MARSHALL MATHERS LP']);
  assert.deepEqual(musicArtistGroups([artist('DRAKE', 'UCaaaaaaaaaaaaaaaaaaaaaa')]), []);
  assert.deepEqual(musicArtistGroups([]), []);
});

test('the artist prefix is removed from an album name only when it matches', () => {
  assert.equal(musicAlbumTitle('DRAKE', 'DRAKE · TAKE CARE'), 'TAKE CARE');
  assert.equal(musicAlbumTitle('drake', 'Drake · Take Care'), 'Take Care');
  assert.equal(musicAlbumTitle('DRAKE', 'TAKE CARE'), 'TAKE CARE');
  assert.equal(musicAlbumTitle('', 'TAKE CARE'), 'TAKE CARE');
  assert.equal(musicAlbumTitle('DRAKE', ''), '');
});
