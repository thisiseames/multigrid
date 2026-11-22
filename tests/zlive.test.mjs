import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeZlive, zliveEmbed } from '../src/zlive.js';

const channel = (over = {}) => ({
  id: 'channel',
  name: 'Channel',
  region: 'USA',
  flag: 'us',
  quality: 'HD',
  sport: 'Sports',
  live: true,
  url: 'https://zlive.st/embed/channel',
  ...over,
});

test('Zlive keeps live channels, drops bad links and sorts by category', () => {
  const list = normalizeZlive({ channels: [
    channel({ id: 'sports', name: 'B Sports' }),
    channel({ id: 'f1', name: 'C F1', sport: 'F1', region: 'UK', flag: 'gb' }),
    channel({ id: 'kids', name: 'A Kids', sport: 'Kids' }),
    channel({ id: 'other', name: 'D Other', sport: '', region: '' }),
    channel({ id: 'sports', name: 'Duplicate', url: 'https://zlive.st/embed/duplicate' }),
    channel({ id: 'off', name: 'Offline', live: false }),
    channel({ id: 'bad', name: 'Bad', url: 'https://example.com/embed/bad' }),
    channel({ id: 'bad2', name: 'Bad 2', url: 'https://zlive.st/watch/bad' }),
  ] });
  assert.deepEqual(list.map((item) => item.name), ['B Sports', 'C F1', 'A Kids', 'D Other']);
  assert.deepEqual(list.map((item) => item.category), ['Sports', 'F1', 'Kids', 'Other']);
  assert.equal(list[3].region, '');
  assert.equal(list[0].region, 'United States');
  assert.equal(list[1].region, 'UK');
  assert.equal(list[0].live, true);
});

test('Zlive embeds use white controls, the app background and no branding', () => {
  const url = new URL(zliveEmbed('https://zlive.st/embed/skysportsf1-uk2?keep=1'));
  assert.equal(url.origin, 'https://zlive.st');
  assert.equal(url.pathname, '/embed/skysportsf1-uk2');
  assert.equal(url.searchParams.get('accent'), 'f5f5f7');
  assert.equal(url.searchParams.get('bg'), '0b0b0c');
  assert.equal(url.searchParams.get('title'), '0');
  assert.equal(url.searchParams.get('brand'), '0');
  assert.equal(url.searchParams.get('controls'), 'auto');
  assert.equal(url.searchParams.get('frame'), '0');
  assert.equal(url.searchParams.get('keep'), '1');
});

test('Zlive refuses links that are not its embed pages', () => {
  assert.equal(zliveEmbed(''), '');
  assert.equal(zliveEmbed('https://zlive.st/watch/nope'), '');
  assert.equal(zliveEmbed('https://example.com/embed/nope'), '');
  assert.equal(zliveEmbed('http://zlive.st/embed/nope'), '');
});
