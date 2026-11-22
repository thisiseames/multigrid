import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanText,
  clearLibraryMetaCache,
  episodeMeta,
  loadMovieMeta,
  loadShowMeta,
  movieMetaFromWiki,
  showMetaFromTvMaze,
} from '../src/library-meta.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

test('TVmaze episodes become clean titles, dates and summaries', () => {
  const meta = showMetaFromTvMaze(
    { id: 42, name: 'Silo' },
    [{ season: 3, number: 8, name: 'Gray Goo', airdate: '2025-01-10', summary: '<p>Juliette <b>returns</b> &amp; everything changes.</p>' }],
  );
  assert.equal(meta.name, 'Silo');
  const episode = episodeMeta(meta, 3, 8);
  assert.equal(episode.title, 'Gray Goo');
  assert.equal(episode.airdate, '2025-01-10');
  assert.equal(episode.summary, 'Juliette returns & everything changes.');
  assert.equal(episodeMeta(meta, 3, 9), null);
  assert.equal(cleanText('<p>One &amp; two</p>', 100), 'One & two');
});

test('show metadata is fetched once and cached', async () => {
  clearLibraryMetaCache();
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    if (url.includes('singlesearch')) return { ok: true, json: async () => ({ id: 42, name: 'Silo' }) };
    if (url.includes('/shows/42/episodes')) return { ok: true, json: async () => [{ season: 3, number: 8, name: 'Gray Goo', airdate: '2025-01-10', summary: 'Hello' }] };
    return { ok: false };
  };
  const first = await loadShowMeta('Silo', { fetchImpl, now: 1000 });
  const second = await loadShowMeta('Silo', { fetchImpl, now: 2000 });
  assert.equal(first.name, 'Silo');
  assert.deepEqual(second, first);
  assert.equal(calls, 2);
});

test('movie details combine Wikipedia plot with Wikidata cast and runtime', async () => {
  clearLibraryMetaCache();
  let calls = 0;
  const page = { title: 'Gravity (2013 film)', extract: 'A medical engineer survives a disaster in space.', pageprops: { wikibase_item: 'Q1' }, fullurl: 'https://en.wikipedia.org/wiki/Gravity_(2013_film)' };
  const fetchImpl = async (url) => {
    calls++;
    if (url.includes('en.wikipedia.org')) return { ok: true, json: async () => ({ query: { pages: { 1: { index: 1, ...page } } } }) };
    if (url.includes('wbgetentities') && url.includes('Q1')) return { ok: true, json: async () => ({ entities: { Q1: { claims: { P161: [{ mainsnak: { datavalue: { value: { id: 'Q2' } } } }], P2047: [{ mainsnak: { datavalue: { value: { amount: 91 } } } }] } } } }) };
    if (url.includes('wbgetentities') && url.includes('Q2')) return { ok: true, json: async () => ({ entities: { Q2: { labels: { en: { value: 'Sandra Bullock' } } } } }) };
    return { ok: false };
  };
  const meta = await loadMovieMeta('Gravity', 2013, { fetchImpl, now: 1000 });
  assert.equal(meta.title, 'Gravity (2013 film)');
  assert.match(meta.plot, /medical engineer/);
  assert.deepEqual(meta.cast, ['Sandra Bullock']);
  assert.equal(meta.runtime, '91 min');
  const again = await loadMovieMeta('Gravity', 2013, { fetchImpl, now: 2000 });
  assert.deepEqual(again, meta);
  assert.equal(calls, 3);
});

test('a missing movie is cached as nothing and does not keep asking', async () => {
  clearLibraryMetaCache();
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, json: async () => ({ query: { pages: {} } }) }; };
  assert.equal(await loadMovieMeta('No Such Film', 2020, { fetchImpl, now: 1000 }), null);
  assert.equal(await loadMovieMeta('No Such Film', 2020, { fetchImpl, now: 2000 }), null);
  assert.equal(calls, 1);
});

test('the pure movie mapper keeps only real cast labels', () => {
  const meta = movieMetaFromWiki(
    { title: 'Example', extract: 'Plot.', fullurl: '' },
    { claims: { P161: [{ mainsnak: { datavalue: { value: { id: 'Q9' } } } }], P2047: [{ mainsnak: { datavalue: { value: { amount: 120 } } } }] } },
    { Q9: { labels: { en: { value: 'An Actor' } } } },
  );
  assert.deepEqual(meta.cast, ['An Actor']);
  assert.equal(meta.runtime, '120 min');
});
