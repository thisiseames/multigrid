import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { imdbChartRows, imdbListRows, imdbStreamingRows, rtBrowseRows, rtEditorialRows } from '../tools/lists-rows.mjs';
import { PICK_ROW_IDS } from '../src/homelayout.js';

const chart = `# Most popular movies

#1      #### [The Odyssey](https://www.imdb.com/title/tt33764258/?ref_=chtmvm_t_1)

![Image 1: The Odyssey (2026)](https://m.media-amazon.com/images/M/odyssey._V1_QL75_UX90_CR0,0,90,133_.jpg)   [](https://www.imdb.com/title/tt33764258/?ref_=chtmvm_i_1)

2026

#2      #### [Project Hail Mary](https://www.imdb.com/title/tt12042730/?ref_=chtmvm_t_2)

![Image 2: Project Hail Mary (2026)](https://m.media-amazon.com/images/M/hail._V1_QL75_UX90_CR0,0,90,133_.jpg)   [](https://www.imdb.com/title/tt12042730/?ref_=chtmvm_i_2)

2026
`;

test('IMDb charts keep rank, title, year and an upscaled poster', () => {
  const rows = imdbChartRows(chart, 'film');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    rank: 1,
    title: 'The Odyssey',
    year: 2026,
    kind: 'film',
    poster: 'https://m.media-amazon.com/images/M/odyssey._V1_QL75_UX300_CR0,0,300,444_.jpg',
    url: 'https://www.imdb.com/title/tt33764258/',
  });
});

test('an IMDb editorial list reads its numbered title entries', () => {
  const page = `#### [1. & Sons](https://www.imdb.com/title/tt5265480/?ref_=ls_t_1)

![Image 1: & Sons (2025)](https://m.media-amazon.com/images/M/sons._V1_QL75_UX90_CR0,1,90,133_.jpg)   [](https://www.imdb.com/title/tt5265480/?ref_=ls_i_1)

2025

#### [2. Brides](https://www.imdb.com/title/tt13289160/?ref_=ls_t_2)

2025`;
  const rows = imdbListRows(page, 'film');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, '& Sons');
  assert.equal(rows[0].year, 2025);
  assert.equal(rows[1].title, 'Brides');
});

test('the Nielsen streaming list gets its titles from the image descriptions', () => {
  const page = `*   ![Image 1: Billy Bob Thornton in Landman (2024)](https://m.media-amazon.com/images/M/landman._V1_QL75_UX90_CR0,0,90,133_.jpg)

[](https://www.imdb.com/title/tt14186672/?ref_=ls_i_1)

*   ![Image 2: Only Murders in the Building (2021)](https://m.media-amazon.com/images/M/om._V1_QL75_UX90_CR0,0,90,133_.jpg)

[](https://www.imdb.com/title/tt11691774/?ref_=ls_i_2)

*   ![Image 3: Noah Wyle in The Pitt (2025)](https://m.media-amazon.com/images/M/pitt._V1_QL75_UX90_CR0,0,90,133_.jpg)

[](https://www.imdb.com/title/tt31938062/?ref_=ls_i_3)`;
  const rows = imdbStreamingRows(page, 'show');
  assert.deepEqual(rows.map((row) => row.title), ['Landman', 'Only Murders in the Building', 'The Pitt']);
  assert.deepEqual(rows.map((row) => row.year), [2024, 2021, 2025]);
  assert.equal(rows[0].url, 'https://www.imdb.com/title/tt14186672/');
});

test('a Rotten Tomatoes browse page reads its poster tiles', () => {
  const page = `<html><body><poster-tile slot="poster" media-url="/m/blue_film" data-qa="discovery-media-list-item">
  <rt-img alt="Blue Film" src="https://resizing.flixster.com/abc=/164x246/v2/poster.jpg"></rt-img>
</poster-tile>
<a data-qa="discovery-media-list-item-caption" href="/m/blue_film">
  <rt-text data-qa="discovery-media-list-item-title">Blue Film</rt-text>
  <rt-text data-qa="discovery-media-list-item-start-date">Streaming Jun 12, 2026</rt-text>
</a></body></html>`;
  const rows = rtBrowseRows(page, 'film');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    rank: 1,
    title: 'Blue Film',
    year: 2026,
    kind: 'film',
    poster: 'https://resizing.flixster.com/abc=/300x450/v2/poster.jpg',
    url: 'https://www.rottentomatoes.com/m/blue_film',
  });
});

test('an RT Best of the year guide keeps its rank, poster and season-free title', () => {
  const page = `#1[![Image 1: Cupertino](https://resizing.flixster.com/a=/200x300/v2/cupertino.jpg)](https://www.rottentomatoes.com/tv/cupertino/s01)

#2[![Image 2: Adults](https://resizing.flixster.com/b=/200x300/v2/adults.jpg)](https://www.rottentomatoes.com/tv/adults/s02)`;
  const rows = rtEditorialRows(page, { kind: 'show', year: 2026 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'Cupertino');
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].year, 2026);
  assert.equal(rows[0].poster, 'https://resizing.flixster.com/a=/300x450/v2/cupertino.jpg');
  assert.equal(rows[1].title, 'Adults');
});

test('a page with no matching rows gives an empty list', () => {
  assert.deepEqual(imdbChartRows('nothing here'), []);
  assert.deepEqual(imdbListRows(''), []);
  assert.deepEqual(imdbStreamingRows(''), []);
  assert.deepEqual(rtBrowseRows('<html></html>'), []);
  assert.deepEqual(rtEditorialRows(''), []);
});

test('lists.json carries every category with a title, a safe link and a poster', () => {
  const data = JSON.parse(readFileSync(new URL('../lists.json', import.meta.url), 'utf8'));
  assert.equal(data.lists.length, 9);
  const ids = data.lists.map((list) => list.id);
  for (const id of PICK_ROW_IDS) assert.ok(ids.includes(id), id);
  for (const list of data.lists) {
    assert.ok(list.entries.length >= 10, list.id);
    for (const entry of list.entries) {
      assert.ok(entry.title, list.id);
      assert.match(entry.url, /^https:\/\/(?:www\.)?(?:imdb|rottentomatoes)\.com\//);
      if (entry.poster) assert.match(entry.poster, /^https:\/\//);
      assert.ok(entry.kind === 'film' || entry.kind === 'show');
    }
  }
});
