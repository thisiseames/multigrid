import test from 'node:test';
import assert from 'node:assert/strict';
import { basisText, catalogFresh, popularityOf, rankForYou, ratingOf, recencyOf, tasteOf, titleKey } from '../src/for-you.js';

test('titles compare cleanly: years, punctuation, accents and leading articles', () => {
  assert.equal(titleKey('Dune (2021)'), 'dune');
  assert.equal(titleKey('Dune 2021'), 'dune');
  assert.equal(titleKey('The Body'), 'body');
  assert.equal(titleKey('Amélie'), 'amelie');
  assert.equal(titleKey('1917'), '1917');
  assert.equal(titleKey('Black Doves: Season 2'), 'black doves');
  assert.equal(titleKey(''), '');
});

test('a rating uses IMDb and Rotten Tomatoes together, or whichever is there', () => {
  assert.ok(Math.abs(ratingOf({ imdb: 8, rt: 100 }) - 0.86) < 1e-9);
  assert.ok(Math.abs(ratingOf({ imdb: 8 }) - 0.8) < 1e-9);
  assert.ok(Math.abs(ratingOf({ imdb: 8, rt: null }) - 0.8) < 1e-9);
  assert.ok(Math.abs(ratingOf({ rt: 90 }) - 0.9) < 1e-9);
  assert.equal(ratingOf({}), 0);
  assert.equal(popularityOf({ imdbVotes: 1_000_000 }), 1);
});

test('taste: finished beats favourite beats partway, and a title counts once', () => {
  const catalog = [
    { title: 'Black Doves', genres: ['Crime', 'Drama', 'Thriller'], imdbVotes: 100 },
    { title: 'MobLand', genres: ['Crime', 'Drama'], imdbVotes: 50 },
    { title: 'Severance', genres: ['Sci-Fi', 'Thriller'], imdbVotes: 200 },
    { title: 'The Bear', genres: ['Comedy', 'Drama'], imdbVotes: 300 },
  ];
  const taste = tasteOf({
    favorites: [{ name: 'Severance' }, { name: 'Black Doves' }],
    places: {
      one: { input: 'x', name: 'MobLand', at: 20, length: 100 },
      two: { input: 'y', name: 'The Bear', at: 95, length: 100 },
    },
    watched: ['Black Doves'],
    catalog,
  });
  assert.deepEqual(taste.weights, { Crime: 4, Drama: 7, Thriller: 4.5, Comedy: 3, 'Sci-Fi': 1.5 });
  assert.deepEqual(taste.basis, ['Drama', 'Thriller', 'Crime', 'Comedy', 'Sci-Fi']);
  assert.equal(taste.hasTaste, true);
  assert.deepEqual([...taste.seen].sort(), ['bear', 'black doves', 'mobland', 'severance']);
  assert.equal(basisText(taste.basis), 'drama, thriller and crime');
});

test('the ten: taste first, score next, never something already seen', () => {
  const catalog = [
    { title: 'Crime One', genres: ['Crime'], imdb: 7, imdbVotes: 10_000 },
    { title: 'Crime Two', genres: ['Crime'], imdb: 9, imdbVotes: 900_000 },
    { title: 'Comedy One', genres: ['Comedy'], imdb: 8.5, imdbVotes: 500_000 },
    { title: 'Seen Crime', genres: ['Crime'], imdb: 9.5, imdbVotes: 1_000_000 },
  ];
  const taste = { weights: { Crime: 3 }, seen: new Set(['seen crime']), basis: ['Crime'], hasTaste: true };
  const ten = rankForYou({ catalog, taste, limit: 3 });
  assert.deepEqual(ten.map((entry) => entry.title), ['Crime Two', 'Crime One', 'Comedy One']);
  assert.deepEqual(ten.map((entry) => entry.rank), [1, 2, 3]);
});

test('four per genre, then relax if there are not enough', () => {
  const catalog = Array.from({ length: 6 }, (_, index) => ({ title: `Crime ${index}`, genres: ['Crime'], imdb: 9 - index / 10, imdbVotes: 1000 }));
  catalog.push({ title: 'Comedy', genres: ['Comedy'], imdb: 7, imdbVotes: 100 });
  const taste = { weights: { Crime: 3 }, seen: new Set(), basis: ['Crime'], hasTaste: true };
  const four = rankForYou({ catalog, taste, limit: 5, maxPerGenre: 4 });
  assert.equal(four.filter((entry) => entry.genres[0] === 'Crime').length, 4);
  assert.equal(four.at(-1).title, 'Comedy');
  const all = rankForYou({ catalog, taste, limit: 7, maxPerGenre: 4 });
  assert.equal(all.length, 7);
});

test('with no taste, the best-rated popular titles win, and remakes collapse', () => {
  const catalog = [
    { title: 'Dune', year: 1984, genres: ['Sci-Fi'], imdb: 6.5, imdbVotes: 100_000 },
    { title: 'Dune', year: 2021, genres: ['Sci-Fi'], imdb: 8, imdbVotes: 900_000 },
    { title: 'Quiet Gem', genres: ['Drama'], imdb: 9.2, imdbVotes: 2_000 },
  ];
  const ten = rankForYou({ catalog, taste: null, limit: 10 });
  assert.deepEqual(ten.map((entry) => entry.title), ['Dune', 'Quiet Gem']);
  assert.equal(ten[0].year, 2021);
});

test('a small recency nudge keeps the ten from becoming an all-time list', () => {
  const now = new Date(2026, 0, 1).getTime();
  assert.equal(recencyOf({ year: 2026 }, now), 1);
  assert.equal(recencyOf({ year: 2014 }, now), 0);
  const catalog = [
    { title: 'Old Classic', year: 2000, genres: ['Drama'], imdb: 9, imdbVotes: 1_000_000 },
    { title: 'New Good', year: 2026, genres: ['Drama'], imdb: 8.8, imdbVotes: 800_000 },
  ];
  const taste = { weights: { Drama: 3 }, seen: new Set(), basis: ['Drama'], hasTaste: true };
  const ten = rankForYou({ catalog, taste, limit: 2, now });
  assert.deepEqual(ten.map((entry) => entry.title), ['New Good', 'Old Classic']);
});

test('an empty catalogue, no taste and an old file are handled quietly', () => {
  assert.deepEqual(rankForYou({ catalog: [], taste: null }), []);
  assert.deepEqual(rankForYou({ catalog: [{ title: 'A' }], taste: { weights: {}, seen: new Set() } }).length, 1);
  assert.equal(catalogFresh(Math.floor(Date.now() / 1000) - 2 * 86400), true);
  assert.equal(catalogFresh(Math.floor(Date.now() / 1000) - 8 * 86400), false);
  assert.equal(catalogFresh(0), false);
});
