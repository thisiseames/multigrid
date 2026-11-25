import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTikTokProfile, readTikTokEmbed, readTikTokProfile, readTikTokVideo, shortTikTokCount } from '../src/tiktok-profile.js';

const scope = (value) => `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(value)}</script>`;
const connect = (value) => `<script id="__FRONTITY_CONNECT_STATE__" type="application/json">${JSON.stringify(value)}</script>`;

const profile = () => scope({
  __DEFAULT_SCOPE__: {
    'webapp.user-detail': {
      statusCode: 0,
      userInfo: {
        user: {
          uniqueId: 'example',
          nickname: 'Example & Co',
          avatarLarger: 'https://cdn.example/avatar.jpg',
          verified: true,
          signature: 'Hello <world>',
          privateAccount: false,
        },
        stats: { followerCount: 1253393, followingCount: 12, heartCount: 76300000, videoCount: 34 },
        statsV2: { followerCount: '1253393', followingCount: '12', heartCount: '76300000', videoCount: '34' },
      },
    },
  },
}) + `
<a href="https://www.tiktok.com/@example/video/7709581433802657054"><img alt="A clip &amp; more created by example with sound" src="https://cdn.example/cover.jpg?a=1&amp;b=2"><strong data-e2e="video-views">1.7M</strong></a>
<a href="https://www.tiktok.com/@example/video/7708948674478656798"><img alt="Second clip created by example" src="https://cdn.example/cover2.jpg"><strong data-e2e="video-views">856.4K</strong></a>
<a href="https://www.tiktok.com/@example/video/7709581433802657054"><img alt="Duplicate" src="https://cdn.example/dup.jpg"></a>`;

test('a TikTok profile page gives the header and video cards', () => {
  const data = readTikTokProfile(profile());
  assert.equal(data.user.handle, 'example');
  assert.equal(data.user.name, 'Example & Co');
  assert.equal(data.user.avatar, 'https://cdn.example/avatar.jpg');
  assert.equal(data.user.verified, true);
  assert.equal(data.user.signature, 'Hello <world>');
  assert.equal(data.user.followers, 1253393);
  assert.equal(data.user.following, 12);
  assert.equal(data.user.likes, 76300000);
  assert.equal(data.user.videos, 34);
  assert.equal(data.videos.length, 2);
  assert.equal(data.videos[0].title, 'A clip & more');
  assert.equal(data.videos[0].cover, 'https://cdn.example/cover.jpg?a=1&b=2');
  assert.equal(data.videos[0].views, '1.7M');
  assert.ok(data.videos[0].createdAt > 0);
  assert.equal(data.videos[1].title, 'Second clip');
});

test('a profile page without the embedded data is not a profile', () => {
  assert.equal(readTikTokProfile('<html><body>nope</body></html>'), null);
});

test('the account embed gives the header and its recent videos with views', () => {
  const data = readTikTokEmbed(connect({
    source: {
      data: {
        '/embed/@example?lang=en-US': {
          userInfo: {
            uniqueId: 'example',
            nickname: 'Example & Co',
            avatarThumbUrl: 'https://cdn.example/avatar-thumb.jpg',
            verified: true,
            signature: 'Hello <world>',
            privateAccount: false,
            followerCount: 1253393,
            followingCount: 12,
            heartCount: 76300000,
          },
          videoList: [
            {
              id: '7709581433802657054',
              desc: 'A clip &amp; more',
              coverUrl: 'https://cdn.example/cover.jpg?a=1&b=2',
              playCount: 1700000,
              authorUniqueId: 'example',
            },
            {
              id: '7708948674478656798',
              desc: 'Second clip',
              originCoverUrl: 'https://cdn.example/cover2.jpg',
              playCount: 856400,
              authorUniqueId: 'example',
            },
            { id: '7708948674478656798', desc: 'Duplicate' },
            { id: 'not-a-video' },
          ],
        },
      },
    },
  }));
  assert.equal(data.user.handle, 'example');
  assert.equal(data.user.name, 'Example & Co');
  assert.equal(data.user.avatar, 'https://cdn.example/avatar-thumb.jpg');
  assert.equal(data.user.verified, true);
  assert.equal(data.user.followers, 1253393);
  assert.equal(data.user.following, 12);
  assert.equal(data.user.likes, 76300000);
  assert.equal(data.user.videos, null);
  assert.equal(data.videos.length, 2);
  assert.equal(data.videos[0].title, 'A clip & more');
  assert.equal(data.videos[0].cover, 'https://cdn.example/cover.jpg?a=1&b=2');
  assert.equal(data.videos[0].views, '1.7M');
  assert.equal(data.videos[1].views, '856.4K');
  assert.ok(data.videos[0].createdAt > 0);
});

test('an embed page without account data is not a profile', () => {
  assert.equal(readTikTokEmbed('<html><body>nope</body></html>'), null);
  assert.equal(readTikTokEmbed(connect({ source: { data: {} } })), null);
});

test('a video page gives views, likes, comments and shares', () => {
  const data = readTikTokVideo(scope({
    __DEFAULT_SCOPE__: {
      'webapp.video-detail': {
        itemInfo: {
          itemStruct: {
            id: '7709581433802657054',
            desc: 'A clip &amp; more',
            createTime: '1795026832',
            video: { cover: 'https://cdn.example/cover.jpg' },
            stats: { playCount: 1700000, diggCount: 496800, commentCount: 3360, shareCount: 24400 },
          },
        },
      },
    },
  }));
  assert.equal(data.id, '7709581433802657054');
  assert.equal(data.title, 'A clip & more');
  assert.equal(data.views, 1700000);
  assert.equal(data.likes, 496800);
  assert.equal(data.comments, 3360);
  assert.equal(data.shares, 24400);
});

test('a video page without a video is not a video', () => {
  assert.equal(readTikTokVideo(scope({ __DEFAULT_SCOPE__: {} })), null);
});

test('short counts read like TikTok', () => {
  assert.equal(shortTikTokCount(1253393), '1.3M');
  assert.equal(shortTikTokCount(76300000), '76.3M');
  assert.equal(shortTikTokCount(856400), '856.4K');
  assert.equal(shortTikTokCount(1250), '1.3K');
  assert.equal(shortTikTokCount(694), '694');
});

test('a profile fetch merges the exact header with the embed videos and caches them', async () => {
  const realFetch = globalThis.fetch;
  const asked = [];
  const handle = 'fixturemerge';
  const profileHtml = scope({
    __DEFAULT_SCOPE__: {
      'webapp.user-detail': {
        userInfo: {
          user: { uniqueId: handle, nickname: 'Fixture', avatarLarger: 'https://cdn.example/avatar.jpg', verified: true },
          stats: { followerCount: 1253393, followingCount: 12, heartCount: 76300000, videoCount: 34 },
          statsV2: { followerCount: '1253393', followingCount: '12', heartCount: '76300000', videoCount: '34' },
        },
      },
    },
  });
  const embedHtml = connect({
    source: {
      data: {
        [`/embed/@${handle}?lang=en-US`]: {
          userInfo: {
            uniqueId: handle, nickname: 'Fixture', avatarThumbUrl: 'https://cdn.example/thumb.jpg',
            followerCount: 1200000, followingCount: 12, heartCount: 76000000,
          },
          videoList: [
            { id: '7709581433802657054', desc: 'First', coverUrl: 'https://cdn.example/one.jpg', playCount: 1700000 },
            { id: '7708948674478656798', desc: 'Second', coverUrl: 'https://cdn.example/two.jpg', playCount: 856400 },
          ],
        },
      },
    },
  });
  const videoHtml = (id, plays, likes, comments, shares) => scope({
    __DEFAULT_SCOPE__: {
      'webapp.video-detail': {
        itemInfo: {
          itemStruct: {
            id, desc: `Video ${id}`, createTime: '1795026832', video: { cover: `https://cdn.example/${id}.jpg` },
            stats: { playCount: plays, diggCount: likes, commentCount: comments, shareCount: shares },
          },
        },
      },
    },
  });
  globalThis.fetch = async (url) => {
    const text = String(url);
    asked.push(text);
    if (text.includes('/embed/')) return new Response(embedHtml, { status: 200 });
    if (text.includes('/video/7709581433802657054')) return new Response(videoHtml('7709581433802657054', 1700000, 496800, 3360, 24400), { status: 200 });
    if (text.includes('/video/7708948674478656798')) return new Response(videoHtml('7708948674478656798', 856400, 10300, 64, 20), { status: 200 });
    return new Response(profileHtml, { status: 200 });
  };
  try {
    const data = await loadTikTokProfile(handle, { force: true });
    assert.equal(data.user.handle, handle);
    assert.equal(data.user.followers, 1253393);
    assert.equal(data.user.videos, 34);
    assert.equal(data.user.avatar, 'https://cdn.example/avatar.jpg');
    assert.equal(data.videos.length, 2);
    assert.equal(data.videos[0].likes, 496800);
    assert.equal(data.videos[0].comments, 3360);
    assert.equal(data.videos[0].views, '1.7M');
    assert.equal(data.videos[1].likes, 10300);
    assert.equal(data.videos[1].views, '856.4K');
    assert.equal(asked.filter((url) => url.includes('/video/')).length, 2);
    const calls = asked.length;
    const cached = await loadTikTokProfile(handle);
    assert.equal(cached.user.handle, handle);
    assert.equal(asked.length, calls, 'a second look inside ten minutes uses the cache');
  } finally {
    globalThis.fetch = realFetch;
  }
});
