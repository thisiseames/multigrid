import test from 'node:test';
import assert from 'node:assert/strict';
import { parseXList, parseXProfile, parseXVideoPage } from '../src/x-feed.js';

const PAGE = `
*   [](https://x.com/NASA/status/1111111111111111111)[![Image 3: @NASA](https://pbs.twimg.com/a)](https://x.com/NASA)  [NASA](https://x.com/NASA) [7h](https://x.com/NASA/status/1111111111111111111)   A launch video  [Video 2](https://x.com/NASA)![Image 4](https://pbs.twimg.com/amplify_video_thumb/1)     00:00
*   [](https://x.com/NASA/status/2222222222222222222)[![Image 5: @NASA](https://pbs.twimg.com/a)](https://x.com/NASA)  [NASA](https://x.com/NASA) [9h](https://x.com/NASA/status/2222222222222222222)   Just a picture  ![Image 6](https://pbs.twimg.com/media/x)
*   [](https://x.com/OTHER/status/3333333333333333333)  A quoted post with [Video 1]
*   [](https://x.com/NASA/status/4444444444444444444)[![Image 7: @NASA](https://pbs.twimg.com/a)](https://x.com/NASA)  [NASA](https://x.com/NASA) [Nov 18](https://x.com/NASA/status/4444444444444444444)   Second video  [Video 1](https://x.com/NASA)
`;

test('x feed: keeps only the account own posts that carry video, newest first', () => {
  const found = parseXProfile(PAGE, 'NASA');
  assert.deepEqual(found.ids, ['1111111111111111111', '4444444444444444444']);
  assert.equal(found.posts, 3);
});

test('x feed: the handle matches whatever case the page uses', () => {
  assert.equal(parseXProfile(PAGE, 'nasa').ids.length, 2);
});

test('x feed: a page with nothing on it finds no posts', () => {
  assert.deepEqual(parseXProfile('Log in to X', 'NASA'), { ids: [], posts: 0 });
});

test('x feed: picks the largest MP4 and tidies the address', () => {
  const html = '<video src="https://video.twimg.com/a/vid/avc1/480x270/a.mp4?tag=16&amp;x=1\\"></video>'
    + '<video src="https://video.twimg.com/a/vid/avc1/1280x720/b.mp4?tag=16\\"></video>';
  const url = parseXVideoPage(html);
  assert.match(url, /1280x720/);
  assert.match(url, /tag=16&x=1|tag=16/);
  assert.ok(!url.includes('amp;'));
  assert.ok(!url.endsWith('\\'));
});

test('x feed: a page with no MP4 returns nothing', () => {
  assert.equal(parseXVideoPage('<p>No video here</p>'), '');
});

const MEMBERS_PANEL = `Manage members
Members (3)
Suggested
List members

Cenk Uygur
@cenkuygur
Host of 
@TheYoungTurks
. Founder of 
@TYT
.

Acyn
@Acyn

Aaron Rupar
@atrupar
Powered by 
@SnapStream
.`;

test('x list: a copied members panel keeps members, not the handles in bios', () => {
  assert.deepEqual(parseXList(MEMBERS_PANEL), ['cenkuygur', 'acyn', 'atrupar']);
});

test('x list: one handle or profile link per line, duplicates removed', () => {
  assert.deepEqual(parseXList('@acyn\nnasa\nhttps://x.com/espn\nhttps://twitter.com/Acyn'), ['acyn', 'nasa', 'espn']);
});

test('x list: a CSV uses its handle column', () => {
  assert.deepEqual(parseXList('ProfileId,Username,Name\n1,@acyn,Acyn\n2,espn,ESPN'), ['acyn', 'espn']);
});
