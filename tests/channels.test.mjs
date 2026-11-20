import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChannelList } from '../src/channels.js';

const LIST = `#EXTM3U
#EXTINF:-1 tvg-id="SkyNews.uk" tvg-name="Sky News" tvg-logo="https://example.com/sky.png" group-title="News",Sky News
https://example.com/sky.m3u8
#EXTINF:-1 tvg-id="NoLogo.us" group-title="News",No Logo Channel (720p)
https://example.com/nologo.m3u8
#EXTINF:-1 tvg-id="Http.us" tvg-name="Insecure" group-title="News",Insecure
http://example.com/insecure.m3u8
#EXTINF:-1 tvg-id="Locked.us" tvg-name="Locked" group-title="News",Locked
#EXTVLCOPT:http-referrer=https://example.com/
https://example.com/locked.m3u8
#EXTINF:-1 tvg-id="Pluto.us" tvg-name="Pluto One" group-title="Movies",Pluto One
https://jmp2.uk/plu-123.m3u8
#EXTINF:-1 tvg-id="Dup.us" tvg-name="Sky News" tvg-logo="https://example.com/sky.png" group-title="News",Sky News
https://example.com/sky.m3u8
`;

test('channels: keeps playable https feeds with their names and logos', () => {
  const list = parseChannelList(LIST);
  assert.deepEqual(list.map((item) => item.name), ['No Logo Channel (720p)', 'Sky News']);
  assert.equal(list.find((item) => item.name === 'Sky News').logo, 'https://example.com/sky.png');
  assert.equal(list.find((item) => item.name === 'No Logo Channel (720p)').group, 'News');
});

test('channels: drops insecure, header-locked, Pluto and duplicate feeds', () => {
  const names = parseChannelList(LIST).map((item) => item.name);
  assert.ok(!names.includes('Insecure'));
  assert.ok(!names.includes('Locked'));
  assert.ok(!names.includes('Pluto One'));
  assert.equal(names.filter((name) => name === 'Sky News').length, 1);
});

test('channels: an empty list is empty', () => {
  assert.deepEqual(parseChannelList(''), []);
});

import { channelTitle } from '../src/channels.js';

test('channels: a favourite title drops quality and notes, and is uppercase', () => {
  assert.equal(channelTitle('CNN International North America (1080p) [Geo-blocked]'), 'CNN INTERNATIONAL NORTH AMERICA');
  assert.equal(channelTitle('Sky Sports  Action (720p)'), 'SKY SPORTS ACTION');
});
