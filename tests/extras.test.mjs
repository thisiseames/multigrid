import test from 'node:test';
import assert from 'node:assert/strict';
import { extrasFor, pick, searchesFor, seconds, titleKey, videosFrom } from '../tools/extras-pick.mjs';

// Real YouTube results seen Nov 23 (titles and channels as YouTube showed them).
const v = (id, title, channel, length = '2:00', verified = false) => ({ id, title, channel, seconds: seconds(length), verified, ago: '' });

test('searches: a show by its season (the recap is of the season before), a film by its year', () => {
  assert.deepEqual(searchesFor({ name: 'Black Doves', kind: 'show', season: 2 }).map((s) => s.query), [
    'Black Doves season 2 official trailer', 'Black Doves season 1 recap', 'Black Doves season 2 promo', 'Black Doves season 2 cast interview']);
  assert.equal(searchesFor({ name: 'Severance', kind: 'show' })[1].query, 'Severance recap');
  assert.deepEqual(searchesFor({ name: 'Dune', kind: 'film', year: 2021 }).map((s) => s.kind), ['Trailer', 'Interview', 'Interview']);
  assert.equal(searchesFor({ name: 'Dune', kind: 'film', year: 2021 })[0].query, 'Dune 2021 official trailer');
});

test('lengths', () => {
  assert.equal(seconds('2:12'), 132);
  assert.equal(seconds('1:02:03'), 3723);
  assert.equal(seconds(''), 0);
  assert.equal(seconds(undefined), 0);
});

test('videos from a YouTube results page', () => {
  const page = `<script>var ytInitialData = ${JSON.stringify({ contents: { a: [{ videoRenderer: { videoId: 'MOU2thjq6Z0', title: { runs: [{ text: 'Black Doves: Season 2 | Official Trailer | Netflix' }] }, ownerText: { runs: [{ text: 'Netflix' }] }, lengthText: { simpleText: '2:12' }, ownerBadges: [{}], publishedTimeText: { simpleText: '1mo ago' } } }] } })};</script>`;
  assert.deepEqual(videosFrom(page), [{ id: 'MOU2thjq6Z0', title: 'Black Doves: Season 2 | Official Trailer | Netflix', channel: 'Netflix', seconds: 132, verified: true, ago: '1mo ago' }]);
  assert.deepEqual(videosFrom('<html>nothing</html>'), []);
  assert.deepEqual(videosFrom('var ytInitialData = {broken;</script>'), []);
});

test('pick: the right kind, the whole name, no reactions/reviews/music, sensible length', () => {
  const videos = [
    v('a', 'Black Doves: Season 2 | Official Trailer | Netflix', 'Netflix', '2:12', true),
    v('b', 'Black Doves Season 2 Trailer REACTION', 'Some Guy', '12:00'),
    v('c', 'Black Doves: Season 2 | Official Trailer Music | Netflix', 'AJ Music', '2:01'),
    v('d', 'Doves in the city | Official Trailer', 'X', '2:00', true),
    v('e', 'Black Doves #shorts trailer', 'Y', '0:15'),
    v('f', 'Black Doves | Official Trailer | Netflix', 'Netflix', '2:34', true),
  ];
  const ids = pick(videos, { name: 'Black Doves', kind: 'Trailer', show: true, season: 2 }, 3).map((x) => x.id);
  assert.deepEqual(ids, ['a'], 'this season’s trailer beats every other version');
  assert.deepEqual(pick(videos, { name: 'Black Doves', kind: 'Trailer', show: true }, 3).map((x) => x.id), ['a', 'f']);
  assert.deepEqual(pick(videos, { name: 'Black Doves', kind: 'Recap' }), []);
});

test('pick: one-word names need their service, or a studio-style title on a verified channel', () => {
  const raw = [
    v('film', 'Raw Official Trailer 1 (Universal Pictures) HD', 'Universal Pictures UK', '1:25', true),
    v('wwe', "WWE | John Cena's Last RAW | Official Trailer | Netflix", 'Netflix and WWE on Netflix', '0:41', true),
  ];
  assert.deepEqual(pick(raw, { name: 'Raw', kind: 'Trailer', show: true, service: 'Netflix' }).map((x) => x.id), ['wwe']);
  const vision = [v('m', 'Marvel Television’s VisionQuest | Official Trailer', 'Marvel Entertainment', '2:30', true), v('s', 'VISIONQUEST trailer leaked', 'Leaks', '2:00')];
  assert.deepEqual(pick(vision, { name: 'VisionQuest', kind: 'Trailer', show: true }).map((x) => x.id), ['m']);
  const body = [v('spam', 'THE BODY TRAILER|THE BODY HINDI TRAILER|THE BODY TRAILER IN HINDI|THE BODY|Netflix', 'Zero Box Office', '2:00'), v('ok', 'The Body Season 1 - Trailer | Netflix', 'Filmaholic', '2:00')];
  assert.deepEqual(pick(body, { name: 'The Body', kind: 'Trailer', show: true, service: 'Netflix' }).map((x) => x.id), ['ok']);
});

test('pick: shows never get "movie" clips; foreign-language copies are skipped', () => {
  const videos = [v('m', 'Nocturne (2020) | Horror | Movie Recap', 'RecapRecap', '13:47'), v('d', 'Taken: Natalee Holloway | Officiële trailer | Netflix', 'Netflix NL', '1:52', true)];
  assert.deepEqual(pick(videos, { name: 'Nocturne', kind: 'Recap', show: true }), []);
  assert.deepEqual(pick(videos, { name: 'Taken: Natalee Holloway', kind: 'Trailer', show: true, service: 'Netflix' }), []);
});

test('extras for a title: kinds in order, re-uploads once, at most 6', () => {
  const searches = [
    { kind: 'Trailer', videos: [v('t1', 'Nobody Wants This | Season 3 Official Trailer | Netflix', 'Netflix', '2:00', true), v('t2', 'Nobody Wants This | Season 3 Official Trailer | Netflix Philippines', 'Netflix Philippines', '2:00', true)] },
    { kind: 'Recap', videos: [v('r1', 'NOBODY WANTS THIS Season 1&2 Recap Before Season 3', 'Bingeable Recaps', '9:00')] },
    { kind: 'Promo', videos: [v('p1', 'Nobody Wants This Season 3 | Sneak Peek | Netflix', 'Netflix', '1:10', true)] },
    { kind: 'Interview', videos: [v('i1', 'The Nobody Wants This Cast Interview', 'Etalk', '5:00'), v('i2', 'Nobody Wants This behind the scenes', 'Netflix', '4:00', true), v('i3', 'Nobody Wants This cast interview 3', 'Z', '4:00')] },
  ];
  const clips = extrasFor({ name: 'Nobody Wants This', kind: 'show', season: 3, service: 'Netflix' }, searches);
  assert.deepEqual(clips.map((c) => c.id), ['t1', 'r1', 'p1', 'i2', 'i1']);
  assert.deepEqual(Object.keys(clips[0]), ['id', 'kind', 'title', 'channel', 'seconds']);
});

test('title keys match the app', () => {
  assert.equal(titleKey('The Black Doves'), 'black doves');
  assert.equal(titleKey('PERSON OF INTEREST'), 'person of interest');
  assert.equal(titleKey('Love & Death'), 'love and death');
});
