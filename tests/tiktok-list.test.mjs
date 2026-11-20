import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFollowingList } from '../src/tiktok-list.js';

const TXT = `Date: 2024-05-01 10:00:00 UTC
Username: SomeOne
Date: 2024-04-01 10:00:00 UTC
Username: @another.one
Username: someone
`;

test('following: txt export becomes tidy, sorted usernames', () => {
  assert.deepEqual(parseFollowingList(TXT, 'Following.txt').names, ['another.one', 'someone']);
});

test('following: older txt file name still works', () => {
  assert.deepEqual(parseFollowingList(TXT, 'Following List.txt').names, ['another.one', 'someone']);
});

test('following: the followers file is refused with a reason', () => {
  assert.match(parseFollowingList(TXT, 'Follower.txt').error, /followers list/);
});

test('following: the zip is refused before reading it', () => {
  assert.match(parseFollowingList('anything', 'TikTok_Data_2026.zip').error, /ZIP/);
});

test('following: json export reads the following section, never followers', () => {
  const data = {
    'Profile And Settings': {
      'Follower List': { Follower: [{ Date: 'x', UserName: 'fan' }] },
      'Following List': { Following: [{ Date: 'x', UserName: 'friend' }, { UserName: '@Other' }] },
    },
  };
  assert.deepEqual(parseFollowingList(JSON.stringify(data), 'user_data_tiktok.json').names, ['friend', 'other']);
});

test('following: json without a following section is an error', () => {
  const data = { 'Profile And Settings': { Follower: [{ UserName: 'fan' }] } };
  assert.match(parseFollowingList(JSON.stringify(data), 'user_data_tiktok.json').error, /doesn't look/);
});

test('following: an empty file is an error', () => {
  assert.match(parseFollowingList('   ', 'Following.txt').error, /empty/);
});

test('following: names that are not handles are ignored', () => {
  const text = 'Username: good_name\nUsername: not a name!\nUsername: another-name\n';
  assert.deepEqual(parseFollowingList(text, 'Following.txt').names, ['good_name']);
});
