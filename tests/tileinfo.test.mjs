import test from 'node:test';
import assert from 'node:assert/strict';
import { leftText, tileCard, xrayAvailable } from '../src/tileinfo.js';

const now = Date.parse('2026-11-22T21:00:00Z');

test('time left reads like a person would say it', () => {
  assert.equal(leftText(38 * 60), '38 min left');
  assert.equal(leftText(65 * 60), '1 hr 5 min left');
  assert.equal(leftText(120 * 60), '2 hr left');
  assert.equal(leftText(5), '1 min left');
});

test('a TV channel: live, what is on, time left, and what is next', () => {
  const card = tileCard({ kind: 'website', name: 'Sky Sports PL', guide: { current: { title: 'Live PL: Liverpool v Man United', end: now + 38 * 60000 }, next: { title: 'Super Sunday', start: now + 40 * 60000 } } }, now);
  assert.equal(card.live, true);
  assert.equal(card.title, 'Live PL: Liverpool v Man United');
  assert.equal(card.lines[0], '38 min left');
  assert.match(card.lines[1], /^Next: Super Sunday · /);
});

test('a game: the score and clock win over the listings', () => {
  const match = { state: 'in', detail: "63'", home: { abbr: 'LIV', score: 1, logo: 'l' }, away: { abbr: 'MUN', score: 0, logo: 'm' } };
  const card = tileCard({ kind: 'website', name: 'Sky Sports PL', match, guide: { current: { title: 'Live PL', end: now + 60000 } } }, now);
  assert.equal(card.live, true);
  assert.deepEqual([card.score.home.name, card.score.home.score, card.score.away.name, card.score.away.score, card.score.clock], ['LIV', '1', 'MUN', '0', "63'"]);
  assert.deepEqual(card.lines, ['Live PL']);
  assert.deepEqual(card.score.order, ['home', 'away']);
  assert.deepEqual(tileCard({ match: { ...match, sport: 'football/nfl' } }).score.order, ['away', 'home']);
  const before = tileCard({ match: { ...match, state: 'pre', start: now } }, now);
  assert.equal(before.live, false);
  assert.equal(before.score.home.score, '');
});

test('Twitch never gets a card; a plain website with nothing known gets none', () => {
  assert.equal(tileCard({ kind: 'twitch', name: 'xQc', player: { live: true } }), null);
  assert.equal(tileCard({ kind: 'website', name: 'Some site' }), null);
});

test('YouTube, files, series pages and accounts', () => {
  assert.equal(tileCard({ kind: 'youtube', name: 'MKBHD', player: { title: 'iPhone review', at: 60, length: 1500 } }), null);
  const recording = tileCard({ kind: 'hls', name: 'Match replay', player: { title: '', at: 60, length: 25 * 60 } });
  assert.deepEqual([recording.title, recording.lines], ['Match replay', ['24 min left']]);
  assert.equal(tileCard({ kind: 'hls', name: 'CP24', player: { live: true } }).live, true);
  const file = tileCard({ kind: 'playlist', name: 'Succession', player: { title: 'S01E03.mkv', episode: 3, episodes: 10, at: 0, length: 3600 } });
  assert.deepEqual(file.lines, ['Episode 3 of 10', '1 hr left']);
  assert.deepEqual(tileCard({ kind: 'website', name: 'Black Doves', series: 'S2 E8 · 34 min in' }).lines, ['S2 E8 · 34 min in']);
  assert.deepEqual(tileCard({ kind: 'x', name: 'acyn' }).lines, ['X']);
});

test('a film page gets a card (it opens X-Ray on the laptop)', () => {
  assert.deepEqual(tileCard({ kind: 'page', name: 'Dune: Part Two (2024)', film: 'Film' }), { live: false, title: 'Dune: Part Two (2024)', lines: ['Film'], score: null });
});

test('TikTok videos, profiles and lives have no X-Ray', () => {
  for (const kind of ['tiktok', 'tiktokprofile', 'tiktoklive']) {
    assert.equal(xrayAvailable({ ok: true, kind }), false, kind);
  }
  assert.equal(xrayAvailable({ ok: true, kind: 'youtube' }), true);
  assert.equal(xrayAvailable({ ok: true, kind: 'iframe' }), true);
  assert.equal(xrayAvailable({ ok: true, kind: 'youtubechannel' }), false);
  assert.equal(xrayAvailable({ ok: false, kind: 'iframe' }), false);
});
