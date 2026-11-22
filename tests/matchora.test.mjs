import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMatchora } from '../src/matchora.js';

const now = 1800000000000;
const match = (over = {}) => ({
  id: '1',
  home: 'Home',
  away: 'Away',
  league: 'League',
  sport: 'Soccer',
  kickoff: Math.floor(now / 1000) + 3600,
  status: 'NS',
  live: false,
  finished: false,
  channel_count: 1,
  channels: [{ id: '10', name: 'TSN', country: 'CA', quality: 'HD', lang: 'English' }],
  embed_url: 'https://matchora.pro/embed/match/1',
  home_badge: 'https://matchora.pro/img/home.png',
  away_badge: 'https://matchora.pro/img/away.png',
  league_badge: null,
  ...over,
});

test('Matchora keeps live/upcoming matches, drops finished and past rows', () => {
  const list = normalizeMatchora({ events: [
    match({ id: 'live', home: 'A', away: 'B', live: true, status: 'LIVE', score: '2-1', minute: '67', embed_url: 'https://matchora.pro/embed/match/live' }),
    match({ id: 'later', home: 'C', away: 'D', kickoff: Math.floor(now / 1000) + 7200, embed_url: 'https://es.matchora.pro/embed/match/later' }),
    match({ id: 'finished', home: 'E', away: 'F', finished: true, status: 'FT' }),
    match({ id: 'past', home: 'G', away: 'H', kickoff: Math.floor(now / 1000) - 4 * 3600 }),
    match({ id: 'bad', home: 'I', away: 'J', embed_url: 'https://example.com/embed/match/bad' }),
    match({ id: 'live', home: 'duplicate' }),
  ] }, now);
  assert.deepEqual(list.map((item) => item.id), ['live', 'later']);
  assert.equal(list[0].name, 'A vs B');
  assert.equal(list[0].score, '2-1');
  assert.equal(list[0].minute, '67');
  assert.equal(list[0].input, 'https://matchora.pro/embed/match/live');
  assert.equal(list[1].input, 'https://matchora.pro/embed/match/later');
  assert.equal(list[0].channelCount, 1);
});

test('Matchora handles a home-only event and insecure badges', () => {
  const [event] = normalizeMatchora({ events: [match({
    id: 'aew', home: 'Collision #171', away: '', home_badge: 'http://matchora.pro/x.png', away_badge: '', league_badge: 'https://es.matchora.pro/league.png',
  })] }, now);
  assert.equal(event.name, 'Collision #171');
  assert.equal(event.homeBadge, '');
  assert.equal(event.awayBadge, '');
  assert.equal(event.leagueBadge, 'https://matchora.pro/league.png');
});

test('Matchora refuses non-match embed URLs and malformed answers', () => {
  assert.deepEqual(normalizeMatchora({ events: [
    match({ id: 'watch', embed_url: 'https://matchora.pro/watch/1' }),
    match({ id: 'http', embed_url: 'http://matchora.pro/embed/match/1' }),
    match({ id: 'empty', home: '', away: '' }),
  ] }, now), []);
  assert.deepEqual(normalizeMatchora(null, now), []);
  assert.deepEqual(normalizeMatchora({ events: 'nope' }, now), []);
});
