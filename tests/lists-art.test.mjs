import test from 'node:test';
import assert from 'node:assert/strict';
import { addJustWatchArt, bestJustWatchMatch, rowKey } from '../tools/lists-art.mjs';

const node = (title, year, kind = 'MOVIE', backdrop = '/backdrop/1/{profile}/x.{format}', desc = 'About it', clips = []) => ({
  objectType: kind,
  content: { title, originalReleaseYear: year, shortDescription: desc, backdrops: backdrop ? [{ backdropUrl: backdrop }] : [], clips },
});
const answer = (...nodes) => ({ data: { searchTitles: { edges: nodes.map((n) => ({ node: n })) } } });

test('JustWatch art needs the same title, kind and year', () => {
  const found = bestJustWatchMatch(answer(
    node('The Odyssey', 1997),
    node('The Odyssey', 2026, 'MOVIE', '/backdrop/9/{profile}/odyssey.{format}', 'Nolan’s Odyssey'),
  ), { title: 'The Odyssey', year: 2026, kind: 'film' });
  assert.deepEqual(found, {
    image: 'https://images.justwatch.com/backdrop/9/s1440/odyssey.jpg',
    desc: 'Nolan’s Odyssey',
    year: 2026,
    trailer: '',
  });
  assert.equal(bestJustWatchMatch(answer(node('The Odyssey', 1997)), { title: 'The Odyssey', year: 2026, kind: 'film' }), null);
  assert.equal(bestJustWatchMatch(answer(node('The Odyssey', 2026, 'SHOW')), { title: 'The Odyssey', year: 2026, kind: 'film' }), null);
});

test('a title with no year still matches its exact name and kind', () => {
  const found = bestJustWatchMatch(answer(node('The Body', 2026, 'SHOW', '/backdrop/2/{profile}/body.{format}')), { title: 'The Body', year: 0, kind: 'show' });
  assert.match(found.image, /^https:\/\/images\.justwatch\.com\/backdrop\/2\/s1440\/body\.jpg$/);
});

test('ampersands and accents compare as words; a missing picture keeps the description', () => {
  assert.equal(bestJustWatchMatch(answer(node('& Sons', 2025)), { title: 'and Sons', year: 2025, kind: 'film' }).image, 'https://images.justwatch.com/backdrop/1/s1440/x.jpg');
  const noPicture = bestJustWatchMatch(answer(node('Sons', 2025, 'MOVIE', '', 'A drama')), { title: 'Sons', year: 2025, kind: 'film' });
  assert.deepEqual(noPicture, { image: '', desc: 'A drama', year: 2025, trailer: '' });
});

test('RT rows accept the exact title when the list date is not the release year', () => {
  const show = node('Slow Horses', 2022, 'SHOW', '/backdrop/3/{profile}/slow-horses.{format}');
  assert.equal(bestJustWatchMatch(answer(show), { title: 'Slow Horses', year: 2026, kind: 'show' }), null);
  assert.deepEqual(bestJustWatchMatch(answer(show), { title: 'Slow Horses', year: 2026, kind: 'show' }, { strictYear: false }), {
    image: 'https://images.justwatch.com/backdrop/3/s1440/slow-horses.jpg',
    desc: 'About it',
    year: 2022,
    trailer: '',
  });
});

test('the first official trailer is kept, not a teaser or another site', () => {
  const clips = [
    { provider: 'YOUTUBE', externalId: 'zzz123YYY45', name: 'Official Teaser' },
    { provider: 'YOUTUBE', externalId: 'abc123DEF45', name: 'Official Trailer' },
    { provider: 'DAILYMOTION', externalId: 'abc123DEF45', name: 'Official Trailer' },
  ];
  const found = bestJustWatchMatch(answer(node('The Odyssey', 2026, 'MOVIE', '/backdrop/9/{profile}/odyssey.{format}', 'Nolan’s Odyssey', clips)), { title: 'The Odyssey', year: 2026, kind: 'film' });
  assert.equal(found.trailer, 'abc123DEF45');
});

test('art already found is reused; missing art asks JustWatch once per title', async () => {
  const previous = [{ title: 'The Odyssey', year: 2026, kind: 'film', image: 'https://images.justwatch.com/old.jpg', desc: 'Kept' }];
  const entries = [
    { title: 'The Odyssey', year: 2026, kind: 'film' },
    { title: 'Landman', year: 2024, kind: 'show' },
    { title: 'Landman', year: 2024, kind: 'show' },
  ];
  let asked = 0;
  const lookup = async () => { asked += 1; return { image: 'https://images.justwatch.com/landman.jpg', desc: 'West Texas' }; };
  const result = await addJustWatchArt(entries, { previous, lookup });
  assert.equal(asked, 1);
  assert.equal(result.entries[0].image, 'https://images.justwatch.com/old.jpg');
  assert.equal(result.entries[0].desc, 'Kept');
  assert.equal(result.entries[1].image, 'https://images.justwatch.com/landman.jpg');
  assert.equal(result.entries[2].image, 'https://images.justwatch.com/landman.jpg');
  assert.equal(result.found, 1);
  assert.equal(rowKey(entries[1]), 'show|landman|2024');
});

test('a JustWatch miss leaves the row without art instead of borrowing the wrong picture', async () => {
  const result = await addJustWatchArt([{ title: 'Unknown', year: 2026, kind: 'film' }], { lookup: async () => null });
  assert.equal(result.entries[0].image, undefined);
  assert.equal(result.found, 0);
});
