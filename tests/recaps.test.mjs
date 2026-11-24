import test from 'node:test';
import assert from 'node:assert/strict';
import { pickRecap, recapQueries, seasonPlan } from '../tools/recaps-pick.mjs';

const video = (id, title, extra = {}) => ({ id, title, channel: 'Recaps', seconds: 600, verified: false, ...extra });

test('season plan: between seasons, airing, ended and new', () => {
  assert.deepEqual(seasonPlan({ prevSeason: 1, nextSeason: 2, status: 'Running' }), { latest: 1, next: 2, recap: 1 });
  assert.deepEqual(seasonPlan({ prevSeason: 2, nextSeason: 2, status: 'Running' }), { latest: 1, next: 2, recap: 1 });
  assert.deepEqual(seasonPlan({ prevSeason: 8, nextSeason: 0, status: 'Ended' }), { latest: 8, next: 0, recap: 8 });
  assert.deepEqual(seasonPlan({ prevSeason: 8, nextSeason: 0, status: 'Running' }), { latest: 8, next: 0, recap: 8 });
  assert.deepEqual(seasonPlan({ prevSeason: 0, nextSeason: 1, status: 'Running' }), { latest: 0, next: 1, recap: 0 });
});

test('recap searches: before the next season, latest, previous, whole series', () => {
  assert.deepEqual(recapQueries({ name: 'Succession', latest: 3, next: 4 }), [
    'Succession recap before season 4',
    'Succession season 3 recap',
    'Succession season 2 recap',
    'Succession seasons 1 3 recap',
    'Succession full series recap',
  ]);
  assert.deepEqual(recapQueries({ name: 'MobLand', latest: 1, next: 2 }), [
    'MobLand recap before season 2',
    'MobLand season 1 recap',
    'MobLand recap',
    'MobLand full series recap',
  ]);
});

test('pick a season recap, not a trailer, promo or episode recap', () => {
  const videos = [
    video('trailer', 'MobLand | Official Trailer | Paramount+', { channel: 'Paramount Plus', verified: true }),
    video('promo', 'MobLand 2x09 Promo "Nervous Breakdown"', { seconds: 31 }),
    video('episode', 'Person of Interest - Recap of "Zero Day"', { channel: 'CBS' }),
    video('recap', 'Mobland Season 1 RECAP | Every Twist and Turn You Need to Know | Paramount+', { channel: 'Bobby Does Recaps' }),
  ];
  const picked = pickRecap(videos, { name: 'MobLand', latest: 1, next: 2, service: 'Paramount+' });
  assert.equal(picked.id, 'recap');
  assert.equal(picked.recapSeason, 1);
});

test('pick prefers a recap before the next season and records the recapped season', () => {
  const videos = [
    video('old', 'Succession Season 3 Recap', { channel: 'HBO' }),
    video('before', 'Succession | Recap before Season 4', { channel: 'HBO', verified: true }),
  ];
  const picked = pickRecap(videos, { name: 'Succession', latest: 3, next: 4, service: 'HBO' });
  assert.equal(picked.id, 'before');
  assert.equal(picked.recapSeason, 3);
});

test('no season recap means no pick', () => {
  const videos = [video('episode', 'Dexter - Recap of "Zero Day"', { channel: 'Showtime', verified: true })];
  assert.equal(pickRecap(videos, { name: 'Dexter', latest: 8, next: 0, service: 'Showtime' }), null);
});

test('Season 1 Episode 1 is an episode recap, not a season range', () => {
  const videos = [video('episode', 'Nocturne Season 1 Episode 1 Recap. Lazurus, Come Forth!', { channel: 'X' })];
  assert.equal(pickRecap(videos, { name: 'Nocturne', latest: 1, next: 1, service: 'Netflix', status: 'Running' }), null);
});

test('a short entire-series summary counts when the show is ended', () => {
  const videos = [video('three', '30 Rock in 3 Minutes or Less', { channel: 'MovieWeb+', verified: true, seconds: 183 })];
  const picked = pickRecap(videos, { name: '30 Rock', latest: 7, next: 0, service: 'NBC', status: 'Ended' });
  assert.equal(picked.id, 'three');
  assert.equal(picked.recapSeason, 7);
});
