import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { channelOfFavorite, parseSubscriptions, subscriptionsFromFile } from '../src/yt-subs.js';
import { parseSource } from '../src/sources.js';

const CSV = '﻿Channel Id,Channel Url,Channel Title\r\n'
  + 'UCyFoulEppT3kYN_cSt11M8Q,http://www.youtube.com/channel/UCyFoulEppT3kYN_cSt11M8Q,John Kiriakou\r\n'
  + 'UCqZQlzSHbVJrwrn5XvzrzcA,http://www.youtube.com/channel/UCqZQlzSHbVJrwrn5XvzrzcA,"NBC Sports, Live"\r\n'
  + 'UCyFoulEppT3kYN_cSt11M8Q,http://www.youtube.com/channel/UCyFoulEppT3kYN_cSt11M8Q,John Kiriakou\r\n\r\n';

/** A .zip the way Takeout makes one: deflated entries, a folder path, the central directory at the end. */
function zipOf(files) {
  const locals = []; const centrals = []; let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text); const data = zlib.deflateRawSync(raw); const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data); centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const dir = Buffer.concat(centrals); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}
const fileOf = (bytes, name) => new File([bytes], name);

test('the Takeout CSV gives each channel once, with commas in titles kept', () => {
  assert.deepEqual(parseSubscriptions(CSV), [
    { id: 'UCyFoulEppT3kYN_cSt11M8Q', title: 'John Kiriakou' },
    { id: 'UCqZQlzSHbVJrwrn5XvzrzcA', title: 'NBC Sports, Live' },
  ]);
});

test('a header in another language still works; other files find nothing', () => {
  assert.equal(parseSubscriptions('ID de la chaîne,URL de la chaîne,Titre de la chaîne\nUCSDgFpNwhWvztkEHDaaSSSw,http://www.youtube.com/channel/UCSDgFpNwhWvztkEHDaaSSSw,SDS\n').length, 1);
  assert.deepEqual(parseSubscriptions('name,email\nBob,bob@example.com\n'), []);
});

test('the Takeout .zip is read as it is, the subscriptions file found among others', async () => {
  const zip = zipOf({
    'Takeout/archive_browser.html': '<html></html>',
    'Takeout/YouTube and YouTube Music/playlists/Watch later-videos.csv': 'Video ID,Time Added\nabc,2026\n',
    'Takeout/YouTube and YouTube Music/subscriptions/subscriptions.csv': CSV,
  });
  const channels = await subscriptionsFromFile(fileOf(zip, 'takeout-20261121T000000Z-001.zip'));
  assert.equal(channels.length, 2);
  assert.equal(channels[1].title, 'NBC Sports, Live');
  assert.deepEqual(await subscriptionsFromFile(fileOf(zipOf({ 'Takeout/archive_browser.html': '<html></html>' }), 'takeout.zip')), []);
  assert.equal((await subscriptionsFromFile(fileOf(Buffer.from(CSV), 'subscriptions.csv'))).length, 2);
});

test('channels already in Favorites are recognised however they were saved', () => {
  assert.equal(channelOfFavorite(parseSource('UCyFoulEppT3kYN_cSt11M8Q')), 'UCyFoulEppT3kYN_cSt11M8Q');
  assert.equal(channelOfFavorite(parseSource('https://www.youtube.com/playlist?list=UUZ5cvDR2HhVUcdVoTvvQKLw')), 'UCZ5cvDR2HhVUcdVoTvvQKLw');
  assert.equal(channelOfFavorite(parseSource('https://www.youtube.com/channel/UCqZQlzSHbVJrwrn5XvzrzcA/videos')), 'UCqZQlzSHbVJrwrn5XvzrzcA');
  assert.equal(channelOfFavorite(parseSource('https://x.com/someone')), '');
});
