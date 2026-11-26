import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTmdbSeriesSearch, searchTmdbSeries, tmdbPosterUrl } from '../src/series-search.js';

const page = `### Search Results

*   [TV Shows 2](https://www.themoviedb.org/search/tv?query=Tulsa%20King)
*   [Movies 0](https://www.themoviedb.org/search/movie?query=Tulsa%20King)

[![Image 3: Tulsa King](https://media.themoviedb.org/t/p/w94_and_h141_face/y13WOeZ2rz2Ezpws0RJ0I8sQpG4.jpg)](https://www.themoviedb.org/tv/153312-tulsa-king)

## [Tulsa King](https://www.themoviedb.org/tv/153312-tulsa-king)November 13, 2022

New York mafia capo Dwight "The General" Manfredi is released from prison after 25 years and exiled by his boss to set up shop in Tulsa, Oklahoma.

[![Image 4: Naked and Afraid of Love](https://media.themoviedb.org/t/p/w94_and_h141_face/h28Dth11vc1iyeXdjTuRYhd0nfg.jpg)](https://www.themoviedb.org/tv/130385-naked-and-afraid-of-love)

## [Naked and Afraid of Love](https://www.themoviedb.org/tv/130385-naked-and-afraid-of-love)June 4, 2021

8 single women and 8 single men -- attempt to find true love while working together to survive the elements and each other.
`;

test('TMDB TV search results keep their id, title, year, poster and story', () => {
  const items = parseTmdbSeriesSearch(page);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    id: 153312,
    title: 'Tulsa King',
    year: 2022,
    poster: 'https://media.themoviedb.org/t/p/w342/y13WOeZ2rz2Ezpws0RJ0I8sQpG4.jpg',
    overview: 'New York mafia capo Dwight "The General" Manfredi is released from prison after 25 years and exiled by his boss to set up shop in Tulsa, Oklahoma.',
  });
  assert.equal(items[1].title, 'Naked and Afraid of Love');
  assert.equal(items[1].id, 130385);
  assert.equal(items[1].year, 2021);
  assert.equal(items[1].poster, 'https://media.themoviedb.org/t/p/w342/h28Dth11vc1iyeXdjTuRYhd0nfg.jpg');
});

test('a result without a title heading still gets its name from the poster alt', () => {
  const noHeading = `[![Image 1: Severance](https://media.themoviedb.org/t/p/w94_and_h141_face/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg)](https://www.themoviedb.org/tv/95396-severance)

[](https://www.themoviedb.org/tv/95396-severance)
February 17, 2022

Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives.`;
  const [item] = parseTmdbSeriesSearch(noHeading);
  assert.equal(item.id, 95396);
  assert.equal(item.title, 'Severance');
  assert.equal(item.year, 2022);
  assert.match(item.overview, /^Mark leads a team/);
});

test('the poster is upgraded to card size and a lowercase title is capitalized', () => {
  assert.equal(tmdbPosterUrl('https://media.themoviedb.org/t/p/w94_and_h141_face/abc.jpg'), 'https://media.themoviedb.org/t/p/w342/abc.jpg');
  assert.equal(tmdbPosterUrl('https://image.tmdb.org/t/p/w300/abc.jpg'), 'https://image.tmdb.org/t/p/w342/abc.jpg');
  assert.equal(tmdbPosterUrl('https://example.com/poster.jpg'), 'https://example.com/poster.jpg');
  const lower = `[![Image 1: ozark](https://media.themoviedb.org/t/p/w94_and_h141_face/pCGyPVrI9Fzw6rE1Pvi4BIXF6ET.jpg)](https://www.themoviedb.org/tv/69740-ozark)

[](https://www.themoviedb.org/tv/69740-ozark)
July 21, 2017

A financial adviser drags his family from Chicago to the Missouri Ozarks, where he must launder $500 million in five years.`;
  const [item] = parseTmdbSeriesSearch(lower);
  assert.equal(item.title, 'Ozark');
  assert.equal(item.poster, 'https://media.themoviedb.org/t/p/w342/pCGyPVrI9Fzw6rE1Pvi4BIXF6ET.jpg');
});

test('duplicates, navigation links and empty pages do not become shows', () => {
  const twice = `${page}\n## [Tulsa King](https://www.themoviedb.org/tv/153312-tulsa-king)November 13, 2022\nAnother line.`;
  assert.equal(parseTmdbSeriesSearch(twice).filter((item) => item.id === 153312).length, 1);
  assert.deepEqual(parseTmdbSeriesSearch('## Search Results\n\nThere are no TV shows that matched your query.'), []);
  assert.deepEqual(parseTmdbSeriesSearch(''), []);
  assert.deepEqual(parseTmdbSeriesSearch(null), []);
});

test('a search asks TMDB through the reader and caches the answer', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: true, text: async () => page };
  };
  const first = await searchTmdbSeries('Tulsa King cache test', { fetchImpl });
  const second = await searchTmdbSeries('Tulsa King cache test', { fetchImpl });
  assert.equal(first.failed, false);
  assert.equal(first.items[0].id, 153312);
  assert.deepEqual(second.items, first.items);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/r\.jina\.ai\/https:\/\/www\.themoviedb\.org\/search\/tv\?query=Tulsa%20King%20cache%20test$/);
});

test('a failed page says so and is not cached as no results', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('offline'); };
  const first = await searchTmdbSeries('a different failed search', { fetchImpl });
  const second = await searchTmdbSeries('a different failed search', { fetchImpl });
  assert.deepEqual(first, { items: [], failed: true });
  assert.deepEqual(second, { items: [], failed: true });
  assert.equal(calls, 2);
});

test('a one-letter query is not sent', async () => {
  let called = false;
  const result = await searchTmdbSeries('a', { fetchImpl: async () => { called = true; } });
  assert.deepEqual(result, { items: [], failed: false });
  assert.equal(called, false);
});
