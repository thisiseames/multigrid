import test from 'node:test';
import assert from 'node:assert/strict';

const { readKickStatus } = await import('../src/kick.js');

test('kick: a live channel keeps its title, game, viewers and picture', () => {
  const status = readKickStatus({
    slug: 'sxb',
    user: {
      username: 'SXB',
      profile_pic: 'https://files.kick.com/images/user/1/profile_image/fullsize.webp',
    },
    livestream: {
      is_live: true,
      session_title: '30 day stream',
      viewer_count: 21595,
      start_time: '2026-11-25 09:22:04',
      thumbnail: { url: 'https://stream.kick.com/thumbnails/livestream/1/thumb0.jpg' },
      categories: [{ name: 'Grand Theft Auto V (GTA)' }],
    },
  }, 'SXB');
  assert.equal(status.live, true);
  assert.equal(status.name, 'SXB');
  assert.equal(status.title, '30 day stream');
  assert.equal(status.game, 'Grand Theft Auto V (GTA)');
  assert.equal(status.viewers, 21595);
  assert.equal(status.avatar, 'https://files.kick.com/images/user/1/profile_image/fullsize.webp');
  assert.equal(status.startedAt, Date.parse('2026-11-25T09:22:04Z'));
});

test('kick: an offline channel is known, but not live', () => {
  const status = readKickStatus({
    slug: 'xqc',
    user: { username: 'xQc', profile_pic: 'https://files.kick.com/images/user/2/profile_image/fullsize.webp' },
    livestream: null,
  }, 'xqc');
  assert.equal(status.live, false);
  assert.equal(status.name, 'xQc');
  assert.equal(status.title, '');
  assert.equal(status.viewers, 0);
});

test('kick: the reader wraps the JSON in text, which is read anyway', () => {
  const text = `Title: \n\nURL Source: https://kick.com/api/v2/channels/sxb\n\nMarkdown Content:\n{"slug":"sxb","user":{"username":"SXB"},"livestream":{"is_live":true,"viewer_count":12,"session_title":"Live"}}`;
  const status = readKickStatus(text, 'sxb');
  assert.equal(status.live, true);
  assert.equal(status.viewers, 12);
  assert.equal(status.title, 'Live');
});

test('kick: empty, malformed and another channel are handled quietly', () => {
  assert.equal(readKickStatus(null, 'sxb'), null);
  assert.equal(readKickStatus('', 'sxb'), null);
  assert.equal(readKickStatus('not json', 'sxb'), null);
  assert.equal(readKickStatus({ slug: 'other', livestream: { is_live: true } }, 'sxb'), null);
  assert.equal(readKickStatus({ slug: 'sxb' }, 'sxb').live, false);
});
