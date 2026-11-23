import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAST_LIMIT, agoText, parseEpisode, parseShow, plainText, previousNumber, replayClips, scoringPlays, showSearchUrl, winChance } from '../src/xray.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/xray-${name}.json`, import.meta.url)));

test("TVmaze's show: name, story, cast with characters, last episode", () => {
  const show = parseShow(fixture('show'));
  assert.equal(show.name, 'Black Doves');
  assert.ok(show.summary.length > 20 && !/</.test(show.summary));
  assert.ok(show.cast.length > 0 && show.cast.length <= CAST_LIMIT);
  assert.deepEqual([show.cast[0].name, show.cast[0].character], ['Keira Knightley', 'Helen Webb']);
  assert.ok(show.cast.every((role) => !role.photo || role.photo.startsWith('https://static.tvmaze.com/')));
  assert.equal(show.previous.name, 'Peace Summit');
  assert.equal(parseShow({}), null);
  assert.match(showSearchUrl('Black Doves'), /q=Black%20Doves&embed\[\]=cast/);
});

test('episodes, the one before, and plain text', () => {
  assert.deepEqual(parseEpisode({ season: 2, number: 8, name: 'Peace Summit', summary: '<p>Helen &amp; Sam.</p>' }), { season: 2, number: 8, name: 'Peace Summit', airdate: '', summary: 'Helen & Sam.' });
  assert.deepEqual(previousNumber(2, 8), { season: 2, number: 7 });
  assert.equal(previousNumber(2, 1), null);
  assert.equal(plainText('<b>Bold</b><br>line&nbsp;two'), 'Bold line two');
});

test("ESPN's clips: newest first, only real video files", () => {
  const clips = replayClips(fixture('nba'));
  assert.ok(clips.length >= 1);
  assert.ok(clips.every((clip) => clip.url.endsWith('.mp4') && clip.title));
  for (let i = 1; i < clips.length; i++) assert.ok(clips[i - 1].published >= clips[i].published);
  assert.deepEqual(replayClips({ videos: [{ headline: 'x', links: { source: { href: 'http://bad/x.mp4' } } }] }), []);
});

test('scoring plays and win chance', () => {
  const nfl = fixture('nfl');
  const plays = scoringPlays(nfl, 'football/nfl');
  assert.ok(plays.length >= 1 && plays[0].text);
  assert.match(plays[0].clock, /^Q\d/);
  const chance = winChance(nfl);
  assert.equal(chance.home + chance.away, 100);
  assert.equal(winChance({}), null);
  assert.deepEqual(scoringPlays({ keyEvents: [{ scoringPlay: true, text: 'Goal! Fernandes', clock: { displayValue: "23'" }, team: { abbreviation: 'MUN' } }, { text: 'Corner' }] }, 'soccer/all'), [{ text: 'Goal! Fernandes', clock: "23'", team: 'MUN' }]);
  assert.equal(agoText(Date.now() - 5 * 60000), '5 min ago');
});
