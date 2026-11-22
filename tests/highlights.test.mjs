import test from 'node:test';
import assert from 'node:assert/strict';
import { pickHighlights } from '../tools/build-highlights.mjs';

const game = { home: { name: 'Coventry', full: 'Coventry City', nick: 'Sky Blues', abbr: 'COV' }, away: { name: 'C Palace', full: 'Crystal Palace', nick: 'Eagles', abbr: 'CRY' } };
const r = (id, channel, title, ago = '2h ago') => ({ id, channel, title, ago });

test('only official highlights of this game count: league, rights holders and the two clubs', () => {
  const picks = pickHighlights([
    r('fan', 'CHEFON FF', 'Coventry City - Crystal Palace | 3-2 | Highlights'),
    r('away', 'Crystal Palace FC', 'Match Highlights | Coventry City 3-2 Crystal Palace'),
    r('home', 'Coventry City FC', 'Coventry City 3-2 Crystal Palace | Premier League Highlights'),
    r('talk', 'Coventry City FC', 'Frank Lampard reaction | Coventry City vs Crystal Palace'),
    r('league', 'Premier League', 'EXTENDED HIGHLIGHTS | Coventry City v Crystal Palace'),
    r('old', 'Premier League', 'HIGHLIGHTS | Coventry City v Crystal Palace', '3 months ago'),
    r('other', 'Coventry City FC', 'Highlights | Coventry City 1-0 Leeds'),
  ], game, ['Premier League']);
  assert.deepEqual(picks.map((pick) => pick.id), ['league', 'home', 'away']);
});

test('a club channel only needs to name the other side ("SPURS 2 TOWN 0")', () => {
  const spurs = { home: { name: 'Spurs', full: 'Tottenham Hotspur', nick: 'Spurs', abbr: 'TOT' }, away: { name: 'Ipswich', full: 'Ipswich Town', nick: 'Tractor Boys', abbr: 'IPS' } };
  assert.deepEqual(pickHighlights([r('ips', 'Ipswich Town FC', 'HIGHLIGHTS | SPURS 2 TOWN 0')], spurs, []).map((pick) => pick.id), ['ips']);
});

import { canadaFromPage } from '../tools/build-highlights.mjs';

test('a video counts only when its page says it plays in Canada and on other sites', () => {
  const page = (extra) => `{"playabilityStatus":{"status":"OK","playableInEmbed":true},${extra}}`;
  assert.equal(canadaFromPage(page('"availableCountries":["US","CA","GB"]')), 'yes');
  assert.equal(canadaFromPage(page('"availableCountries":["US","PR"]')), 'no');
  assert.equal(canadaFromPage('{"playabilityStatus":{"status":"OK","playableInEmbed":false},"availableCountries":["CA"]}'), 'no');
  assert.equal(canadaFromPage('{"playabilityStatus":{"status":"UNPLAYABLE","reason":"The uploader has not made this video available in your country"}}'), 'no');
  // YouTube's bot check is not an answer about the video.
  assert.equal(canadaFromPage('{"playabilityStatus":{"status":"LOGIN_REQUIRED","reason":"Sign in to confirm you’re not a bot"},"availableCountries":[]}'), 'unknown');
  assert.equal(canadaFromPage('<html>Sign in to confirm you’re not a bot</html>'), 'unknown');
  assert.equal(canadaFromPage(page('"other":1')), 'unknown');
});
