import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanShowName, groupLibraryFiles, isLibraryVideo, parseLibraryFile } from '../src/library.js';

const file = (path, size = 10) => ({ path, name: path.split('/').pop(), size, modified: 0 });

test('library: groups a folder into shows and seasons, in episode order', () => {
  const shows = groupLibraryFiles([
    file('Test Show/Season 1/Test Show S01E10.mp4'),
    file('Test Show/Season 1/Test Show S01E8.mp4'),
    file('Test Show/Season 1/Test Show S01E9.mp4'),
    file('Other Show/Other Show 2x03.mkv'),
  ]);
  assert.deepEqual(shows.map((show) => show.name), ['Other Show', 'Test Show']);
  const testShow = shows.find((show) => show.name === 'Test Show');
  assert.equal(testShow.seasons[0].number, 1);
  assert.deepEqual(testShow.seasons[0].episodes.map((episode) => episode.episode), [8, 9, 10]);
  assert.deepEqual(testShow.seasons[0].episodes.map((episode) => episode.label), ['S1 E8', 'S1 E9', 'S1 E10']);
  assert.equal(shows.find((show) => show.name === 'Other Show').seasons[0].number, 2);
});

test('library: works when the chosen folder is the season itself', () => {
  const episode = parseLibraryFile(file('Season 1/Test Show S01E8.mp4'));
  assert.equal(episode.show, 'Test Show');
  assert.equal(episode.season, 1);
  assert.equal(episode.episode, 8);
});

test('library: skips samples and trailers, and reads loose movies', () => {
  assert.equal(isLibraryVideo('Show S01E01.mp4'), true);
  assert.equal(isLibraryVideo('sample.mp4'), false);
  assert.equal(isLibraryVideo('Show S01E01.mp4.part'), false);
  const shows = groupLibraryFiles([
    file('Loose Movie.mp4'),
    file('Test Show/Season 1/sample.mp4'),
    file('Test Show/Season 1/Test Show S01E01.mp4'),
  ]);
  assert.deepEqual(shows.map((show) => show.name), ['Loose Movie', 'Test Show']);
  assert.equal(shows[0].seasons[0].episodes.length, 1);
});

test('library: show names lose years and release tags', () => {
  assert.equal(cleanShowName('The.Show.2024.1080p.WEB-DL'), 'The Show');
  assert.equal(cleanShowName('Silo'), 'Silo');
});
