import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
const { cachedSimilar, parseSimilar, saveSimilar, similarFor, similarKey } = await import('../src/similar.js');

const node = (title, kind = 'SHOW', overrides = {}) => ({
  objectType: kind,
  content: {
    title,
    originalReleaseYear: 2024,
    shortDescription: `About ${title}.`,
    backdrops: [{ backdropUrl: `/backdrop/1/{profile}/${title}.{format}` }],
    scoring: { imdbScore: 8.1, imdbVotes: 12345, tomatoMeter: 91, certifiedFresh: true },
    ...overrides,
  },
});

test('similar cards: same kind, no current show, picture and score required, five at most', () => {
  const nodes = [
    node('Current Show'),
    node('Film Only', 'MOVIE'),
    node('No Picture', 'SHOW', { backdrops: [] }),
    node('No Score', 'SHOW', { scoring: {} }),
    node('Blue Lights'),
    node('Blue Lights'),
    node('Nocturne'),
    node('The Pitt'),
    node('Slow Horses'),
    node('Too Many'),
  ];
  const items = parseSimilar(nodes, { title: 'Current Show', kind: 'show' });
  assert.deepEqual(items.map((item) => item.title), ['Blue Lights', 'Nocturne', 'The Pitt', 'Slow Horses', 'Too Many']);
  assert.equal(items[0].image, 'https://images.justwatch.com/backdrop/1/s1440/Blue Lights.jpg');
  assert.deepEqual({ imdb: items[0].imdb, rt: items[0].rt, fresh: items[0].fresh }, { imdb: 8.1, rt: 91, fresh: true });
  assert.equal(items[0].kind, 'show');
  assert.deepEqual(parseSimilar(nodes, { title: 'Current Show', kind: 'film' }).length, 1);
  assert.deepEqual(parseSimilar(null), []);
});

test('the cache is per title and kind, lasts a week, and keeps only the newest 100', () => {
  store.clear();
  saveSimilar('Black Doves', 'show', [{ title: 'Blue Lights' }], 1000);
  assert.deepEqual(cachedSimilar('Black Doves', 'show', 1000 + 86400000), [{ title: 'Blue Lights' }]);
  assert.equal(cachedSimilar('Black Doves', 'show', 1000 + 8 * 86400000), null);
  assert.equal(cachedSimilar('Black Doves', 'film', 1000), null);
  assert.equal(similarKey('Black Doves', 'show'), 'show:black doves');
  for (let index = 0; index < 110; index++) saveSimilar(`Show ${index}`, 'show', [{ title: `Item ${index}` }], 2000 + index);
  const cache = JSON.parse(store.get('multigrid.similar.v1'));
  assert.equal(Object.keys(cache).length, 100);
  assert.ok('show:show 109' in cache);
  assert.equal('show:show 0' in cache, false);
});

test('similarFor uses the cache and does not call out when it has an answer', async () => {
  store.clear();
  saveSimilar('Black Doves', 'show', [{ title: 'Cached' }], Date.now());
  assert.deepEqual(await similarFor({ title: 'Black Doves' }), [{ title: 'Cached' }]);
  assert.deepEqual(await similarFor({ title: '' }), []);
});

test('a show with four genres only keeps neighbours that share three of them', () => {
  const nodes = [
    { objectType: 'SHOW', content: { title: 'Blue Lights', genres: [{ shortName: 'crm' }, { shortName: 'drm' }, { shortName: 'trl' }], backdrops: [{ backdropUrl: '/b/1/{profile}/a.{format}' }], scoring: { imdbScore: 8.2 } } },
    { objectType: 'SHOW', content: { title: 'Rings of Power', genres: [{ shortName: 'act' }, { shortName: 'drm' }], backdrops: [{ backdropUrl: '/b/2/{profile}/b.{format}' }], scoring: { imdbScore: 6.8 } } },
    { objectType: 'SHOW', content: { title: 'Lupin', genres: [{ shortName: 'act' }, { shortName: 'crm' }, { shortName: 'drm' }, { shortName: 'trl' }], backdrops: [{ backdropUrl: '/b/3/{profile}/c.{format}' }], scoring: { imdbScore: 7.5 } } },
    { objectType: 'SHOW', content: { title: 'North of North', genres: [{ shortName: 'cmy' }], backdrops: [{ backdropUrl: '/b/4/{profile}/d.{format}' }], scoring: { imdbScore: 7 } } },
    { objectType: 'SHOW', content: { title: 'Weak Match', genres: [{ shortName: 'act' }, { shortName: 'crm' }, { shortName: 'drm' }], backdrops: [{ backdropUrl: '/b/5/{profile}/e.{format}' }], scoring: { imdbScore: 5.6, tomatoMeter: 59 } } },
  ];
  const items = parseSimilar(nodes, { title: 'Black Doves', kind: 'show', seedGenres: ['act', 'crm', 'drm', 'trl'] });
  assert.deepEqual(items.map((item) => item.title), ['Blue Lights', 'Lupin']);
});

test('a neighbour needs a real score: IMDb 6.0 or RT 60, not 5.9 or 59', () => {
  const card = (title, scoring) => ({ objectType: 'SHOW', content: { title, backdrops: [{ backdropUrl: `/b/${title}.{profile}.{format}` }], scoring } });
  const nodes = [
    card('Just Under', { imdbScore: 5.9, tomatoMeter: 59 }),
    card('Imdb Edge', { imdbScore: 6 }),
    card('Rt Edge', { tomatoMeter: 60 }),
    card('Imdb Only Weak', { imdbScore: 5.1 }),
    card('Rt Good', { imdbScore: 5.5, tomatoMeter: 71 }),
  ];
  const items = parseSimilar(nodes, { title: 'Black Doves', kind: 'show' });
  assert.deepEqual(items.map((item) => item.title), ['Imdb Edge', 'Rt Edge', 'Rt Good']);
});
