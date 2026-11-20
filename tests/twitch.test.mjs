import test from 'node:test';
import assert from 'node:assert/strict';

const { readTwitchStatus, viewerCount } = await import('../src/twitch.js');

test('twitch: a live channel keeps its title, game, viewers and start', () => {
  const status = readTwitchStatus([{
    login: 'kaicenat',
    displayName: 'KaiCenat',
    logo: 'https://static-cdn.jtvnw.net/avatar.png',
    stream: {
      type: 'live',
      title: 'PLAYING GTA 6',
      game: { displayName: 'Grand Theft Auto VI' },
      viewersCount: 25143,
      createdAt: '2026-11-20T12:39:09Z',
    },
  }], 'KaiCenat');
  assert.equal(status.live, true);
  assert.equal(status.name, 'KaiCenat');
  assert.equal(status.title, 'PLAYING GTA 6');
  assert.equal(status.game, 'Grand Theft Auto VI');
  assert.equal(status.viewers, 25143);
  assert.equal(status.logo, 'https://static-cdn.jtvnw.net/avatar.png');
  assert.equal(status.startedAt, Date.parse('2026-11-20T12:39:09Z'));
});

test('twitch: an offline channel is known, but not live', () => {
  const status = readTwitchStatus([{ login: 'hasanabi', displayName: 'HasanAbi', stream: null }], 'hasanabi');
  assert.equal(status.live, false);
  assert.equal(status.name, 'HasanAbi');
  assert.equal(status.title, '');
  assert.equal(status.game, '');
  assert.equal(status.viewers, 0);
});

test('twitch: an unknown channel, empty feed or non-https logo is handled quietly', () => {
  assert.equal(readTwitchStatus([], 'nobody'), null);
  assert.equal(readTwitchStatus(null, 'nobody'), null);
  assert.equal(readTwitchStatus([{ login: 'x', logo: 'http://example.com/a.png', stream: null }], 'x').logo, '');
});

test('twitch: viewer numbers are short', () => {
  assert.equal(viewerCount(999), '999');
  assert.equal(viewerCount(25143), '25k');
  assert.equal(viewerCount(1250000), '1.3M');
  assert.equal(viewerCount(0), '0');
});
