import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filmQuery, parseFilm, castQuery, parseCast, personByNameQuery, parsePersonId, personInfoQuery, personWorksQuery,
  parsePerson, knownFor, parseIntro, wikiIntroUrl, atlanticLink, atlanticTitle, runtimeText, parseSummary, wikiSummaryUrl, sparqlUrl, showByTmdbQuery,
} from '../src/films.js';

// Real Wikidata / Wikipedia answers saved Nov 23.
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/films-${name}.json`, import.meta.url)));

test('a film by its Atlantic (TMDB) number: name, year, runtime, director, trailer, Wikipedia page', () => {
  assert.match(filmQuery({ tmdb: '693134' }), /wdt:P4947 "693134"/);
  assert.match(filmQuery({ imdb: 'tt15239678' }), /wdt:P345 "tt15239678"/);
  const film = parseFilm(fixture('dune'));
  assert.equal(film.name, 'Dune: Part Two');
  assert.equal(film.year, 2024);
  assert.equal(film.minutes, 165);
  assert.equal(film.trailer, 'AreOachjFf0');
  assert.equal(film.tmdb, '693134');
  assert.equal(film.imdb, 'tt15239678');
  assert.equal(film.wiki, 'Dune:_Part_Two');
  assert.deepEqual(film.directors, ['Denis Villeneuve']);
  assert.equal(parseFilm({ results: { bindings: [] } }), null);
  assert.equal(parseFilm(null), null);
});

test('quotes in a name cannot break the query', () => {
  assert.doesNotMatch(personByNameQuery('Bad "name" \\ here'), /"name"/);
});

test('cast: best known first, with photos and characters, no unnamed people', () => {
  assert.match(castQuery('Q109228991'), /wd:Q109228991 p:P161/);
  const cast = parseCast(fixture('dune-cast'));
  assert.ok(cast.length >= 10);
  const zendaya = cast.find((person) => person.name === 'Zendaya');
  assert.equal(zendaya.id, 'Q189489');
  assert.equal(zendaya.character, 'Chani');
  assert.match(zendaya.photo, /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/.+\?width=240$/);
  assert.ok(cast.every((person) => person.name && !/^Q\d+$/.test(person.name)));
  assert.ok(cast.slice(0, 4).some((person) => person.name === 'Timothée Chalamet'));
  assert.equal(parseCast(fixture('dune-cast'), 3).length, 3);
});

test('a person from a cast name', () => {
  assert.match(personByNameQuery('Zendaya'), /rdfs:label "Zendaya"@en/);
  assert.equal(parsePersonId(fixture('zendaya-id')), 'Q189489');
  assert.equal(parsePersonId({ results: { bindings: [] } }), '');
});

test('People search finds directors and creators, and labels stored in mul', () => {
  const search = personByNameQuery('Christopher Nolan', { search: true });
  assert.match(search, /@en/);
  assert.match(search, /@mul/);
  assert.match(search, /wdt:P57/);
  assert.match(search, /wdt:P170/);
  assert.doesNotMatch(personByNameQuery('Zendaya'), /wdt:P57/);
  assert.match(personWorksQuery('Q25191', { search: true }), /wdt:P161\|wdt:P57/);
  assert.doesNotMatch(personWorksQuery('Q25191'), /wdt:P161\|wdt:P57/);
});

test('a person: who they are and every title Atlantic can play, best known first', () => {
  assert.match(personInfoQuery('Q189489'), /wd:Q189489/);
  assert.match(personWorksQuery('Q189489'), /GROUP BY \?work/);
  const person = parsePerson(fixture('zendaya-info'), fixture('zendaya-works'), 'Q189489');
  assert.equal(person.name, 'Zendaya');
  assert.match(person.about, /actress/);
  assert.equal(person.born, 1996);
  assert.match(person.photo, /\?width=320$/);
  const names = person.titles.map((title) => title.name);
  for (const name of ['Euphoria', 'Challengers', 'Dune: Part Two']) assert.ok(names.includes(name), name);
  const euphoria = person.titles.find((title) => title.name === 'Euphoria');
  assert.equal(euphoria.kind, 'show');
  assert.equal(euphoria.tmdb, '85552');
  assert.equal(person.titles.find((title) => title.name === 'Challengers').kind, 'film');
  assert.ok(person.titles.every((title) => /^\d+$/.test(title.tmdb) && !/^Q\d+$/.test(title.name)));
  // One entry per TMDB title.
  const keys = person.titles.map((title) => `${title.kind}:${title.tmdb}`);
  assert.equal(new Set(keys).size, keys.length);
  // A lead role beats a famous film with bigger names in it: Euphoria is in her top 6.
  assert.ok(knownFor(person.titles).known.some((title) => title.name === 'Euphoria'));
  assert.equal(parsePerson({ results: { bindings: [] } }, null), null);
});

test('known for: top 6, then the rest newest first', () => {
  const titles = Array.from({ length: 30 }, (_, at) => ({ name: `T${at}`, year: 1990 + (at % 20) }));
  const { known, more } = knownFor(titles);
  assert.equal(known.length, 6);
  assert.equal(known[0].name, 'T0');
  assert.equal(more.length, 18);
  assert.ok(more.every((title, at) => at === 0 || more[at - 1].year >= title.year));
});

test('known for: the roles their Wikipedia intro names, one per franchise, minor roles skipped', () => {
  assert.match(wikiIntroUrl('Keira_Knightley'), /exintro=1&explaintext=1&titles=Keira%20Knightley$/);
  const keira = parsePerson(fixture('keira-info'), fixture('keira-works'), 'Q42581');
  const intro = parseIntro(fixture('keira-intro'));
  assert.match(intro, /minor role as Sabé in Star Wars/);
  const top = knownFor(keira.titles, intro).known.map((title) => title.name);
  assert.equal(top.length, 6);
  assert.ok(!top.some((name) => /Phantom Menace/.test(name)), 'a minor role is not what she is known for');
  assert.equal(top.filter((name) => /Pirates of the Caribbean/.test(name)).length, 1, 'one per franchise');
  for (const name of ['Pride & Prejudice', 'Atonement', 'Love Actually']) assert.ok(top.includes(name), name);
  const zendaya = parsePerson(fixture('zendaya-info'), fixture('zendaya-works'), 'Q189489');
  const hers = knownFor(zendaya.titles, parseIntro(fixture('zendaya-intro'))).known.map((title) => title.name);
  for (const name of ['Euphoria', 'Challengers']) assert.ok(hers.includes(name), name);
  assert.equal(hers.filter((name) => /^Dune/.test(name)).length, 1);
  assert.equal(parseIntro(null), '');
});

test('Atlantic links both ways', () => {
  // Atlantic plays a film at /watch/<id>; /movie/<id> is its 404 page (Nov 23, owner's report).
  assert.equal(atlanticLink({ kind: 'film', tmdb: '693134' }), 'https://atlantic.bz/watch/693134');
  assert.equal(atlanticLink({ kind: 'film', tmdb: '583406' }), 'https://atlantic.bz/watch/583406');
  assert.equal(atlanticLink({ kind: 'show', tmdb: '85552' }), 'https://atlantic.bz/watch/85552/1/1');
  assert.equal(atlanticLink({ kind: 'film', tmdb: '' }), '');
  assert.equal(atlanticLink({ kind: 'film', tmdb: 'x1' }), '');
  assert.deepEqual(atlanticTitle('https://atlantic.bz/watch/693134'), { kind: 'film', tmdb: '693134' });
  assert.deepEqual(atlanticTitle('https://atlantic.bz/movie/693134'), { kind: 'film', tmdb: '693134' });
  assert.deepEqual(atlanticTitle('https://atlantic.bz/title/tv/95396'), { kind: 'show', tmdb: '95396' });
  assert.deepEqual(atlanticTitle('https://atlantic.bz/watch/95396/2/1'), { kind: 'show', tmdb: '95396' });
  assert.deepEqual(atlanticTitle('https://atlantic.bz/watch/68407/1/3'), { kind: 'show', tmdb: '68407' });
  assert.equal(atlanticTitle('https://www.youtube.com/watch?v=x'), null);
});

test('runtime, Wikipedia summary and addresses', () => {
  assert.equal(runtimeText(165), '2 hr 45 min');
  assert.equal(runtimeText(120), '2 hr');
  assert.equal(runtimeText(45), '45 min');
  assert.equal(runtimeText(0), '');
  const summary = parseSummary(fixture('dune-summary'));
  assert.match(summary.text, /^Dune: Part Two is a 2024/);
  assert.match(summary.image, /^https:\/\/upload\.wikimedia\.org\//);
  assert.deepEqual(parseSummary({ type: 'disambiguation', extract: 'x' }), { text: '', image: '' });
  assert.equal(wikiSummaryUrl('Dune: Part Two'), 'https://en.wikipedia.org/api/rest_v1/page/summary/Dune%3A_Part_Two');
  assert.match(sparqlUrl('ASK {}'), /^https:\/\/query\.wikidata\.org\/sparql\?format=json&query=ASK%20%7B%7D$/);
  assert.match(showByTmdbQuery('95396'), /wdt:P4983 "95396"/);
});
