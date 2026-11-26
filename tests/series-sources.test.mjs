import test from 'node:test';
import assert from 'node:assert/strict';
import { atlanticUrl, cinejoyUrl, flexUrl, seriesLink, seriesSearchUrl } from '../src/series-sources.js';

test('an Atlantic watch link carries its TMDB id, season and episode', () => {
  assert.deepEqual(
    { ...seriesLink('https://atlantic.bz/watch/153312/4/1'), url: undefined },
    { source: 'atlantic', tmdb: 153312, season: 4, episode: 1, url: undefined },
  );
  assert.deepEqual(
    { ...seriesLink('https://www.atlantic.bz/watch/247718/2/8'), url: undefined },
    { source: 'atlantic', tmdb: 247718, season: 2, episode: 8, url: undefined },
  );
  assert.equal(seriesLink('https://atlantic.bz/watch/153312').season, 1);
  assert.equal(seriesLink('https://atlantic.bz/watch/153312').episode, 1);
});

test('a Cinejoy watch link uses the same TMDB id shape', () => {
  assert.deepEqual(
    { ...seriesLink('https://cinejoy.pk/watch/tv/153312/4/1'), url: undefined },
    { source: 'cinejoy', tmdb: 153312, season: 4, episode: 1, url: undefined },
  );
  assert.equal(seriesLink('https://www.cinejoy.pk/watch/tv/46923/2/3').episode, 3);
});

test('a 1Flex play link carries the same id and episode; a film link is not a series', () => {
  const link = seriesLink('https://www.1flex.org/play?id=153312&type=tv&season=4&episode=1&token=abc123');
  assert.equal(link.source, 'flex');
  assert.equal(link.tmdb, 153312);
  assert.equal(link.season, 4);
  assert.equal(link.episode, 1);
  assert.equal(seriesLink('https://www.1flex.org/play?id=153312&type=tv&token=abc123').season, 1);
  assert.equal(seriesLink('https://www.1flex.org/play?id=153312&type=movie&token=abc123'), null);
});

test('other links, missing ids and bad addresses are not series links', () => {
  assert.equal(seriesLink('https://example.com/watch/153312/4/1'), null);
  assert.equal(seriesLink('https://atlantic.bz/title/tv/153312'), null);
  assert.equal(seriesLink('https://atlantic.bz/watch/not-a-number/4/1'), null);
  assert.equal(seriesLink(''), null);
  assert.equal(seriesLink('not a link'), null);
});

test('the builders make the exact links the three sites use', () => {
  assert.equal(atlanticUrl(153312, 4, 1), 'https://atlantic.bz/watch/153312/4/1');
  assert.equal(cinejoyUrl(153312, 4, 1), 'https://cinejoy.pk/watch/tv/153312/4/1');
  assert.equal(flexUrl(153312, 4, 1, 'test-token'), 'https://www.1flex.org/play?id=153312&type=tv&season=4&episode=1&token=test-token');
  assert.equal(atlanticUrl(0), '');
  assert.equal(cinejoyUrl('nope'), '');
  assert.equal(flexUrl(0), '');
});

test('the builders default to the first episode and a random token', () => {
  assert.equal(atlanticUrl(153312), 'https://atlantic.bz/watch/153312/1/1');
  assert.equal(cinejoyUrl(153312), 'https://cinejoy.pk/watch/tv/153312/1/1');
  const first = flexUrl(153312);
  const second = flexUrl(153312);
  assert.match(first, /^https:\/\/www\.1flex\.org\/play\?id=153312&type=tv&season=1&episode=1&token=[A-Za-z0-9]{16}$/);
  assert.notEqual(first, second);
});

test('the search fallbacks are the sites own search pages', () => {
  assert.equal(seriesSearchUrl('atlantic', 'Tulsa King'), 'https://atlantic.bz/search?q=Tulsa%20King');
  assert.equal(seriesSearchUrl('flex', 'Tulsa King'), 'https://www.1flex.org/search?q=Tulsa%20King');
  assert.equal(seriesSearchUrl('cinejoy', 'Tulsa King'), '');
  assert.equal(seriesSearchUrl('atlantic', '  '), '');
});
