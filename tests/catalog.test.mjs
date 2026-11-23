import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogEntry, catalogTitles, mergeCatalog } from '../tools/catalog-rows.mjs';

const node = (title, overrides = {}, kind = 'SHOW') => ({
  objectType: kind,
  content: {
    title,
    originalReleaseYear: 2025,
    shortDescription: `<p>About ${title} &amp; more.</p>`,
    genres: [{ shortName: 'drm' }, { shortName: 'crm' }, { shortName: 'unknown' }],
    backdrops: [{ backdropUrl: `/backdrop/1/{profile}/${title}.{format}` }],
    scoring: { imdbScore: 7.24, imdbVotes: 82156, tomatoMeter: 94, certifiedFresh: true },
    ...overrides,
  },
});

test("a JustWatch node becomes a clean catalogue title", () => {
  const entry = catalogEntry(node('Black Doves'));
  assert.deepEqual(entry, {
    title: 'Black Doves', year: 2025, kind: 'show', genres: ['Drama', 'Crime'],
    image: 'https://images.justwatch.com/backdrop/1/s1440/Black Doves.jpg',
    desc: 'About Black Doves & more.', imdb: 7.2, imdbVotes: 82156, rt: 94, fresh: true,
  });
  assert.equal(catalogEntry(node('Film', {}, 'MOVIE')).kind, 'film');
  assert.equal(catalogEntry(node('No picture', { backdrops: [] })), null);
  assert.equal(catalogEntry(node('No score', { scoring: {} })), null);
  assert.equal(catalogEntry(node('', {})), null);
  assert.equal(catalogEntry({ objectType: 'PERSON', content: { title: 'Someone' } }), null);
});

test('one answer gives only the usable titles', () => {
  const answer = { data: { popularTitles: { edges: [
    { node: node('MobLand') },
    { node: node('No picture', { backdrops: null }) },
    { node: node('VisionQuest', { scoring: { imdbScore: 8.1 } }) },
  ] } } };
  assert.deepEqual(catalogTitles(answer).map((entry) => entry.title), ['MobLand', 'VisionQuest']);
  assert.deepEqual(catalogTitles({ errors: [{}] }), []);
});

test('the same title from several genres is one entry with all its genres', () => {
  const drama = catalogEntry(node('Black Doves'));
  const crime = catalogEntry(node('Black Doves', { genres: [{ shortName: 'trl' }], scoring: { imdbScore: 7.2, imdbVotes: 90000 } }));
  const merged = mergeCatalog([drama, crime]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].genres, ['Drama', 'Crime', 'Thriller']);
  assert.equal(merged[0].imdbVotes, 90000);
});
