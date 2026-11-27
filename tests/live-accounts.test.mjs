import test from 'node:test';
import assert from 'node:assert/strict';
import { liveAccountOf, livePlatformFrom, parseLiveInput } from '../src/live-accounts.js';

test('live accounts: a full link chooses its platform', () => {
  assert.equal(livePlatformFrom('https://www.twitch.tv/xqc'), 'twitch');
  assert.equal(livePlatformFrom('twitch.tv/xqc'), 'twitch');
  assert.equal(livePlatformFrom('https://kick.com/xqc'), 'kick');
  assert.equal(livePlatformFrom('player.kick.com/xqc'), 'kick');
  assert.equal(livePlatformFrom('https://www.tiktok.com/@foo/live'), 'tiktok');
  assert.equal(livePlatformFrom('tiktoklive:@foo'), 'tiktok');
  assert.equal(livePlatformFrom('https://www.youtube.com/@nightcap/live'), 'youtube');
  assert.equal(livePlatformFrom(`UC${'a'.repeat(22)}`), 'youtube');
  assert.equal(livePlatformFrom('@foo'), '');
});

test('live accounts: Twitch accepts a link, an @name and a plain name', () => {
  for (const value of ['https://www.twitch.tv/XQC', 'twitch.tv/xqc', '@xqc', 'xqc']) {
    const account = parseLiveInput('twitch', value);
    assert.equal(account.platform, 'twitch');
    assert.equal(account.handle, 'xqc');
    assert.equal(account.input, 'https://www.twitch.tv/xqc');
  }
  assert.equal(parseLiveInput('twitch', 'player.twitch.tv/?channel=xqc').handle, 'xqc');
  assert.equal(parseLiveInput('twitch', 'https://www.twitch.tv/xqc/videos/123'), null);
  assert.equal(parseLiveInput('twitch', 'https://clips.twitch.tv/SomeClip'), null);
});

test('live accounts: Kick accepts a link, an @name and a plain name', () => {
  for (const value of ['https://kick.com/XQC', 'kick.com/xqc', '@xqc', 'xqc']) {
    const account = parseLiveInput('kick', value);
    assert.equal(account.platform, 'kick');
    assert.equal(account.handle, 'xqc');
    assert.equal(account.input, 'https://kick.com/xqc');
  }
  assert.equal(parseLiveInput('kick', 'https://player.kick.com/xqc').handle, 'xqc');
  assert.equal(parseLiveInput('kick', 'https://kick.com/xqc/videos/123'), null);
  assert.equal(parseLiveInput('kick', 'https://kick.com/browse'), null);
});

test('live accounts: TikTok accepts a live link, @name and plain name', () => {
  for (const value of ['https://www.tiktok.com/@foo/live', '@foo', 'foo', 'tiktoklive:@foo']) {
    const account = parseLiveInput('tiktok', value);
    assert.equal(account.platform, 'tiktok');
    assert.equal(account.handle, 'foo');
    assert.equal(account.input, 'tiktoklive:foo');
  }
  assert.equal(parseLiveInput('tiktok', 'https://www.tiktok.com/@foo/video/123'), null);
});

test('live accounts: YouTube keeps the channel or the lookup it needs', () => {
  const id = `UC${'a'.repeat(22)}`;
  assert.equal(parseLiveInput('youtube', `https://www.youtube.com/channel/${id}/live`).channelId, id);
  assert.equal(parseLiveInput('youtube', 'https://www.youtube.com/@nightcap/live').handle, 'nightcap');
  assert.equal(parseLiveInput('youtube', 'https://www.youtube.com/watch?v=sheUMMvyqSY').videoId, 'sheUMMvyqSY');
});

test('live accounts: a pasted link overrides the open platform', () => {
  assert.equal(parseLiveInput('tiktok', 'https://kick.com/xqc').platform, 'kick');
  assert.equal(parseLiveInput('kick', 'https://www.twitch.tv/xqc').platform, 'twitch');
  assert.equal(parseLiveInput('twitch', 'https://www.tiktok.com/@foo/live').platform, 'tiktok');
  assert.equal(parseLiveInput('tiktok', 'https://www.youtube.com/@nightcap/live').platform, 'youtube');
});

test('live accounts: saved links are identified by platform and handle', () => {
  assert.deepEqual(liveAccountOf('tiktoklive:@Foo'), {
    platform: 'tiktok', handle: 'Foo', username: 'Foo', key: 'tiktok:foo',
  });
  assert.equal(liveAccountOf('https://www.twitch.tv/XQC').key, 'twitch:xqc');
  assert.equal(liveAccountOf('https://kick.com/XQC').key, 'kick:xqc');
  assert.equal(liveAccountOf(`https://www.youtube.com/channel/UC${'a'.repeat(22)}/live`).key, `youtube:uc${'a'.repeat(22)}`);
  assert.equal(liveAccountOf('https://www.twitch.tv/xqc/videos/123'), null);
  assert.equal(liveAccountOf('https://kick.com/xqc/videos/123'), null);
  assert.equal(liveAccountOf('https://www.youtube.com/watch?v=sheUMMvyqSY'), null);
});
