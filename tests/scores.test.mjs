import test from 'node:test';
import assert from 'node:assert/strict';
import { findScore, normTitle, scoreLine, shardKey, votesText } from '../src/scores.js';

const entries = [
  ['oppenheimer', 'Oppenheimer', 1980, 'tvMiniSeries', 'tt0078037', 7.4, 2100],
  ['oppenheimer', 'Oppenheimer', 2023, 'movie', 'tt15398776', 8.2, 1114060],
  ['office', 'The Office', 2001, 'tvSeries', 'tt0290978', 8.5, 150000],
  ['office', 'The Office', 2005, 'tvSeries', 'tt0386676', 9.0, 860142],
];

test('titles made comparable, and which piece they live in', () => {
  assert.equal(normTitle('The Office'), 'office');
  assert.equal(normTitle('Dune: Part Two'), 'dune part two');
  assert.equal(normTitle('Amélie'), 'amelie');
  assert.equal(normTitle('Law & Order'), 'law and order');
  assert.equal(shardKey('Black Doves'), 'bl');
  assert.equal(shardKey('The Office'), 'of');
  assert.equal(shardKey('!'), '_');
});

test('the best match: same title, closest year and kind, then most votes', () => {
  assert.equal(findScore(entries, 'Oppenheimer').id, 'tt15398776');
  assert.equal(findScore(entries, 'Oppenheimer', { year: 1980 }).id, 'tt0078037');
  assert.equal(findScore(entries, 'Oppenheimer', { kind: 'film' }).rating, 8.2);
  assert.equal(findScore(entries, 'The Office').id, 'tt0386676');
  assert.equal(findScore(entries, 'The Office', { year: 2001 }).id, 'tt0290978');
  assert.equal(findScore(entries, 'Oppenheimer', { year: 1999 }), null);
  assert.equal(findScore(entries, 'Nothing'), null);
});

test('how scores read', () => {
  assert.equal(scoreLine({ imdb: 7.24, rt: 94 }), 'IMDb 7.2 · RT 94%');
  assert.equal(scoreLine({ imdb: 9 }), 'IMDb 9.0');
  assert.equal(scoreLine({}), '');
  assert.equal(votesText(82156), '82K');
  assert.equal(votesText(1114060), '1.1M');
});
