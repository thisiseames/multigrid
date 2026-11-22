import test from 'node:test';
import assert from 'node:assert/strict';
import { matchUploads, names, parseFeed } from '../tools/build-highlights.mjs';

const kick = Date.parse('2026-11-21T15:00:00Z');
const later = (hours) => kick + hours * 3600000;
const team = (name, full, nick, place, abbr) => ({ name, full, nick, place, abbr });
const game = { start: kick, home: team('Newcastle', 'Newcastle United', 'Newcastle', 'Newcastle', 'NEW'), away: team('Arsenal', 'Arsenal', 'Arsenal', 'Arsenal', 'ARS') };
const up = (id, title, hours = 3) => ({ id, title, published: later(hours) });

test("a league or broadcaster's upload must name both teams and be highlights from after kick-off", () => {
  const got = matchUploads([
    up('yes', 'Newcastle United vs. Arsenal FC | PREMIER LEAGUE HIGHLIGHTS | Week 11 | Fubo Canada'),
    up('other', 'Chelsea FC vs. Leeds United | PREMIER LEAGUE HIGHLIGHTS | Week 11 | Fubo Canada'),
    up('before', 'Newcastle United vs. Arsenal FC | PREMIER LEAGUE HIGHLIGHTS', -20),
    up('preview', 'Newcastle United vs. Arsenal FC | PREVIEW and highlights of the last meeting'),
  ], game, { kind: 'league', rank: 3 });
  assert.deepEqual(got.map((item) => item.id), ['yes']);
});

test("a club's own upload counts when it shows this game's score or names the other side (clubs name games their own way)", () => {
  const lyon = { start: kick, home: { ...team('Lille', 'Lille', 'Lille', 'Lille', 'LIL'), score: '0' }, away: { ...team('Lyon', 'Lyon', 'Lyon', 'Lyon', 'LYON'), score: '1' } };
  const got = matchUploads([up('ol', 'LOSC 0-1 OL : le résumé'), up('talk', 'Fonseca après LOSC-OL : conférence de presse'), up('old', 'OL 2-0 OM : résumé', -50), up('reserves', 'Lille B 4-0 Créteil : le résumé')], lyon, { kind: 'club', rank: 2 });
  assert.deepEqual(got.map((item) => item.id), ['ol']);
  assert.ok(names('Olympique Lyonnais', lyon.away));
  assert.ok(!names('Olympique de Marseille', lyon.away));
});

test("a channel's feed gives each upload's id, title and time", () => {
  const xml = '<feed><entry><yt:videoId>abcDEF12345</yt:videoId><title>REAL MADRID 2 - 1 CELTA | RESUMEN LALIGA EA SPORTS</title><published>2026-11-21T22:13:00+00:00</published></entry><entry><yt:videoId>x</yt:videoId><title>Q&amp;A</title><published>2026-11-21T10:00:00+00:00</published></entry></feed>';
  const feed = parseFeed(xml);
  assert.equal(feed.length, 2);
  assert.equal(feed[0].title, 'REAL MADRID 2 - 1 CELTA | RESUMEN LALIGA EA SPORTS');
  assert.equal(feed[1].title, 'Q&A');
  assert.equal(feed[0].published, Date.parse('2026-11-21T22:13:00Z'));
});

import { isClubChannel } from '../tools/build-highlights.mjs';

test("a club's channel must really be the club's", () => {
  const nice = { name: 'Nice', full: 'Nice' };
  assert.ok(isClubChannel('OGC Nice', nice));
  assert.ok(!isClubChannel('Ah Nice', nice));
  assert.ok(isClubChannel('Atlanta Hawks', { name: 'Hawks', full: 'Atlanta Hawks' }));
  assert.ok(isClubChannel('Olympique Lyonnais', { name: 'Lyon', full: 'Lyon' }));
  assert.ok(!isClubChannel('Lyon Fans TV', { name: 'Lyon', full: 'Lyon' }));
  assert.ok(isClubChannel('Real Madrid', { name: 'Real Madrid', full: 'Real Madrid' }));
  assert.ok(!isClubChannel('Real Madrid Highlights', { name: 'Real Madrid', full: 'Real Madrid' }));
});
