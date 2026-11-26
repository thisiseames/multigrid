import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTmdbPeople, searchTmdbPeople } from '../src/people-search.js';

const page = `### Search Results

[![Image 9: Robert Pattinson](https://media.themoviedb.org/t/p/w90_and_h90_face/3qZ09UE7lN6AtorfXFRYpEtSY93.jpg)](https://www.themoviedb.org/person/11288-robert-pattinson "Robert Pattinson")

[Robert Pattinson](https://www.themoviedb.org/person/11288-robert-pattinson "Robert Pattinson")

Acting • [The Batman](https://www.themoviedb.org/movie/414906-the-batman "The Batman"), [Twilight](https://www.themoviedb.org/movie/8966-twilight "Twilight"), [The Lighthouse](https://www.themoviedb.org/movie/503919-the-lighthouse "The Lighthouse")

[Robert Pattinson](https://www.themoviedb.org/person/6690575-robert-pattinson "Robert Pattinson")

Acting • [De Blason vs Frédérique 2](https://www.themoviedb.org/movie/1838765-de-blason "De Blason")

[Christopher Nolan](https://www.themoviedb.org/person/525-christopher-nolan "Christopher Nolan")

Directing • [Oppenheimer](https://www.themoviedb.org/movie/872585-oppenheimer "Oppenheimer"), [Inception](https://www.themoviedb.org/movie/27205-inception "Inception")
`;

test('people results keep the name, photo, department and known-for titles', () => {
  const people = parseTmdbPeople(page);
  assert.equal(people.length, 3);
  assert.deepEqual(people[0], {
    id: 11288,
    name: 'Robert Pattinson',
    photo: 'https://media.themoviedb.org/t/p/w185_and_h185_face/3qZ09UE7lN6AtorfXFRYpEtSY93.jpg',
    department: 'Acting',
    knownFor: 'The Batman, Twilight, The Lighthouse',
  });
  assert.equal(people[1].id, 6690575);
  assert.equal(people[1].name, 'Robert Pattinson');
  assert.equal(people[1].photo, '');
  assert.equal(people[2].name, 'Christopher Nolan');
  assert.equal(people[2].department, 'Directing');
  assert.equal(people[2].knownFor, 'Oppenheimer, Inception');
});

test('repeated people, blank pages and no people page give no results', () => {
  assert.equal(parseTmdbPeople(`${page}\n[Robert Pattinson](https://www.themoviedb.org/person/11288-robert-pattinson)`).filter((item) => item.id === 11288).length, 1);
  assert.deepEqual(parseTmdbPeople(''), []);
  assert.deepEqual(parseTmdbPeople(null), []);
});

test('a people search asks TMDB through the reader and caches the answer', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return { ok: true, text: async () => page }; };
  const first = await searchTmdbPeople('Robert Pattinson people test', { fetchImpl });
  const second = await searchTmdbPeople('Robert Pattinson people test', { fetchImpl });
  assert.equal(first.failed, false);
  assert.equal(first.items[0].id, 11288);
  assert.deepEqual(second.items, first.items);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/r\.jina\.ai\/https:\/\/www\.themoviedb\.org\/search\/person\?query=Robert%20Pattinson%20people%20test$/);
});

test('a failed people search says so and is not cached as empty', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('offline'); };
  const first = await searchTmdbPeople('a different failed person', { fetchImpl });
  const second = await searchTmdbPeople('a different failed person', { fetchImpl });
  assert.deepEqual(first, { items: [], failed: true });
  assert.deepEqual(second, { items: [], failed: true });
  assert.equal(calls, 2);
});
