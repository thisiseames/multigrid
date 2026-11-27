import test from 'node:test';
import assert from 'node:assert/strict';
import { loadYouTubeChannel, loadYouTubePlaylist, readYouTubeChannel, readYouTubeFeed, readYouTubeMusicPlaylist, readYouTubePlaylist, readYouTubePlaylists, readYouTubeShorts, readYouTubeVideos } from '../src/youtube-channel.js';

const CHANNEL = `UC${'a'.repeat(22)}`;
const page = (data) => `<!doctype html><html><body><script>var ytInitialData = ${JSON.stringify(data)};</script></body></html>`;

const header = {
  metadata: {
    channelMetadataRenderer: {
      externalId: CHANNEL,
      title: 'Test Channel',
      description: 'A test channel',
      vanityChannelUrl: 'http://www.youtube.com/@testchannel',
      avatar: { thumbnails: [{ url: 'https://example.test/avatar-meta.jpg', width: 900, height: 900 }] },
    },
  },
  header: {
    pageHeaderRenderer: {
      content: {
        pageHeaderViewModel: {
          title: { dynamicTextViewModel: {
            text: { content: 'Test Channel' },
            rendererContext: { accessibilityContext: { label: 'Test Channel, Verified' } },
          } },
          image: { decoratedAvatarViewModel: { avatar: { avatarViewModel: {
            image: { sources: [{ url: 'https://example.test/avatar.jpg', width: 160, height: 160 }] },
          } } } },
          metadata: { contentMetadataViewModel: { metadataRows: [
            { metadataParts: [{ text: { content: '@testchannel' } }] },
            { metadataParts: [{ text: { content: '1.2M subscribers' } }, { text: { content: '100 videos' } }] },
          ] } },
          description: { descriptionPreviewViewModel: { description: { content: 'A test channel' } } },
          banner: { imageBannerViewModel: { image: { sources: [{ url: 'https://example.test/banner.jpg', width: 2120, height: 351 }] } } },
        },
      },
    },
  },
};

const videoLockup = (id, title, live = false) => ({
  richItemRenderer: { content: { lockupViewModel: {
    contentId: id,
    contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
    contentImage: { thumbnailViewModel: {
      image: { sources: [{ url: `https://example.test/${id}.jpg`, width: 720, height: 404 }] },
      overlays: [{ thumbnailBottomOverlayViewModel: { badges: [
        { thumbnailBadgeViewModel: { text: live ? 'LIVE' : '12:34' } },
      ] } }],
    } },
    metadata: { lockupMetadataViewModel: {
      title: { content: title },
      metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [
        { text: { content: '1.2M' }, accessibilityLabel: '1.2 million views' },
        { text: { content: '2d ago' } },
      ] }] } },
    } },
  } } },
});

const videosPage = page({
  ...header,
  contents: { twoColumnBrowseResultsRenderer: { tabs: [
    { tabRenderer: { title: 'Videos', selected: true, content: { richGridRenderer: { contents: [
      videoLockup('vid1AAAAAAA', 'First video'),
      videoLockup('vid2BBBBBBB', 'Live video', true),
    ] } } } },
    { tabRenderer: { title: 'Shorts' } },
    { tabRenderer: { title: 'Playlists' } },
  ] } },
});

const shortsPage = page({
  ...header,
  contents: { twoColumnBrowseResultsRenderer: { tabs: [
    { tabRenderer: { title: 'Videos' } },
    { tabRenderer: { title: 'Shorts', selected: true, content: { richGridRenderer: { contents: [
      { richItemRenderer: { content: { shortsLockupViewModel: {
        entityId: 'shorts-shelf-item-short1AAA',
        accessibilityText: 'A short, 24 thousand views - play Short',
        overlayMetadata: { primaryText: { content: 'A short' }, secondaryText: { content: '24K views' } },
        thumbnailViewModel: { image: { sources: [{ url: 'https://example.test/short.jpg', width: 405, height: 720 }] } },
        onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: 'short1AAA' } } },
      } } } },
    ] } } } },
    { tabRenderer: { title: 'Playlists' } },
  ] } },
});

const playlistsPage = page({
  ...header,
  contents: { twoColumnBrowseResultsRenderer: { tabs: [
    { tabRenderer: { title: 'Videos' } },
    { tabRenderer: { title: 'Shorts' } },
    { tabRenderer: { title: 'Playlists', selected: true, content: { sectionListRenderer: { contents: [
      { itemSectionRenderer: { contents: [
        { gridRenderer: { items: [
          { lockupViewModel: {
            contentId: 'PLtest12345',
            contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST',
            contentImage: { collectionThumbnailViewModel: { primaryThumbnail: { thumbnailViewModel: {
              image: { sources: [{ url: 'https://example.test/playlist.jpg', width: 480, height: 270 }] },
              overlays: [{ thumbnailOverlayBadgeViewModel: { thumbnailBadges: [{ thumbnailBadgeViewModel: { text: '16 videos' } }] } }],
            } } } },
            metadata: { lockupMetadataViewModel: { title: { content: 'A playlist' } } },
          } },
        ] } },
      ] } },
    ] } } } },
  ] } },
});

test('a YouTube channel page gives the header and latest videos', () => {
  const data = readYouTubeChannel(videosPage, 'videos');
  assert.equal(data.header.id, CHANNEL);
  assert.equal(data.header.name, 'Test Channel');
  assert.equal(data.header.handle, 'testchannel');
  assert.equal(data.header.verified, true);
  assert.equal(data.header.subscribers, '1.2M subscribers');
  assert.equal(data.header.videos, '100 videos');
  assert.equal(data.header.banner, 'https://example.test/banner.jpg');
  assert.deepEqual(data.header.tabs, ['Videos', 'Shorts', 'Playlists']);
  assert.equal(data.videos.length, 2);
  assert.equal(data.videos[0].title, 'First video');
  assert.equal(data.videos[0].views, '1.2M views');
  assert.equal(data.videos[0].published, '2d ago');
  assert.equal(data.videos[0].duration, '12:34');
  assert.equal(data.videos[1].live, true);
  assert.equal(readYouTubeVideos(videosPage)[0].url, 'https://www.youtube.com/watch?v=vid1AAAAAAA');
});

test('a YouTube channel Shorts tab gives Shorts', () => {
  const data = readYouTubeChannel(shortsPage, 'shorts');
  assert.equal(data.shorts.length, 1);
  assert.equal(data.shorts[0].id, 'short1AAA');
  assert.equal(data.shorts[0].url, 'https://www.youtube.com/shorts/short1AAA');
  assert.equal(data.shorts[0].title, 'A short');
  assert.equal(data.shorts[0].views, '24K views');
  assert.equal(readYouTubeShorts(shortsPage)[0].cover, 'https://example.test/short.jpg');
});

test('a YouTube channel Playlists tab gives playlists', () => {
  const data = readYouTubeChannel(playlistsPage, 'playlists');
  assert.equal(data.playlists.length, 1);
  assert.equal(data.playlists[0].id, 'PLtest12345');
  assert.equal(data.playlists[0].title, 'A playlist');
  assert.equal(data.playlists[0].count, '16 videos');
  assert.equal(readYouTubePlaylists(playlistsPage)[0].url, 'https://www.youtube.com/playlist?list=PLtest12345');
});

test('a page without channel data is not a channel', () => {
  assert.equal(readYouTubeChannel('<html>no data</html>', 'videos'), null);
});

test('channel loads are cached, and force asks again', async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(videosPage, { status: 200 });
  };
  try {
    const first = await loadYouTubeChannel(CHANNEL, { force: true });
    assert.equal(first.header.name, 'Test Channel');
    const callsAfterFirst = calls;
    const second = await loadYouTubeChannel(CHANNEL);
    assert.equal(second.videos.length, 2);
    assert.equal(calls, callsAfterFirst);
    await loadYouTubeChannel(CHANNEL, { force: true });
    assert.equal(calls, callsAfterFirst + 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});


test('a playlist page becomes a song list in order', () => {
  const playlist = {
    header: { playlistHeaderRenderer: { title: { simpleText: 'Test Album' } } },
    contents: {
      playlistVideoListRenderer: { contents: [
        { playlistVideoRenderer: { videoId: 'bbbbbbbbbbb', index: { simpleText: '2' }, title: { runs: [{ text: 'Second song' }] }, lengthText: { simpleText: '3:02' }, thumbnail: { thumbnails: [{ url: 'https://example.test/2.jpg', width: 480, height: 360 }] } } },
        { playlistVideoRenderer: { videoId: 'aaaaaaaaaaa', index: { simpleText: '1' }, title: { runs: [{ text: 'First song' }] }, lengthText: { simpleText: '2:41' }, thumbnail: { thumbnails: [{ url: 'https://example.test/1.jpg', width: 480, height: 360 }] } } },
        { playlistVideoRenderer: { videoId: 'bbbbbbbbbbb', index: { simpleText: '2' }, title: { runs: [{ text: 'Second song again' }] } } },
      ] },
    },
  };
  const data = readYouTubePlaylist(page(playlist));
  assert.equal(data.title, 'Test Album');
  assert.deepEqual(data.tracks.map((track) => [track.id, track.title, track.length]), [
    ['aaaaaaaaaaa', 'First song', '2:41'],
    ['bbbbbbbbbbb', 'Second song', '3:02'],
  ]);
  assert.deepEqual(data.tracks.map((track) => track.url), [
    'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    'https://www.youtube.com/watch?v=bbbbbbbbbbb',
  ]);
  assert.equal(readYouTubePlaylist('<html>no data</html>'), null);
  assert.equal(readYouTubePlaylist(page({ contents: {} })), null);
});


test('a current playlist page (lockup rows) becomes the same song list', () => {
  const badge = (text) => ({ thumbnailBottomOverlayViewModel: { badges: [{ thumbnailBadgeViewModel: { text } }] } });
  const lockup = (id, title, length) => ({
    lockupViewModel: {
      contentId: id,
      contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
      metadata: { lockupMetadataViewModel: { title: { simpleText: title } } },
      contentImage: { thumbnailViewModel: { image: { sources: [{ url: `https://example.test/${id}.jpg`, width: 480, height: 360 }] }, overlays: [badge(length)] } },
    },
  });
  const data = readYouTubePlaylist(page({ contents: { playlistVideoListRenderer: { contents: [lockup('ccccccccccc', 'Lockup song', '4:05'), lockup('ddddddddddd', 'Another song', '2:10')] } } }));
  assert.deepEqual(data.tracks.map((track) => [track.id, track.title, track.length]), [
    ['ccccccccccc', 'Lockup song', '4:05'],
    ['ddddddddddd', 'Another song', '2:10'],
  ]);
  assert.deepEqual(data.tracks.map((track) => track.cover), ['https://example.test/ccccccccccc.jpg', 'https://example.test/ddddddddddd.jpg']);
});


const musicRow = (id, title, length, index) => ({
  musicResponsiveListItemRenderer: {
    index: { runs: [{ text: String(index) }] },
    playlistItemData: { videoId: id },
    flexColumns: [
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: title }] } } },
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Test Artist' }] } } },
    ],
    fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: length }] } } }],
  },
});

test('a YouTube Music album page becomes a song list in order', () => {
  const album = {
    microformat: { microformatDataRenderer: {
      title: 'Test Album',
      thumbnail: { thumbnails: [{ url: 'https://example.test/album.jpg', width: 544, height: 544 }] },
    } },
    contents: { twoColumnBrowseResultsRenderer: { secondaryContents: { sectionListRenderer: { contents: [
      { musicShelfRenderer: { contents: [
        musicRow('aaaaaaaaaaa', 'First song', '6:07', 1),
        musicRow('bbbbbbbbbbb', 'Second song', '4:28', 2),
      ] } },
    ] } } } },
  };
  const literal = JSON.stringify(album).replace(/'/g, "\\'");
  const html = `<script>const initialData = [];initialData.push({path: '\\/browse', params: JSON.parse('{}'), data: '${literal}'});</script>`;
  const data = readYouTubeMusicPlaylist(html);
  assert.equal(data.title, 'Test Album');
  assert.equal(data.poster, 'https://example.test/album.jpg');
  assert.deepEqual(data.tracks.map((track) => [track.id, track.title, track.length, track.index]), [
    ['aaaaaaaaaaa', 'First song', '6:07', 1],
    ['bbbbbbbbbbb', 'Second song', '4:28', 2],
  ]);
  assert.equal(readYouTubeMusicPlaylist('<html>no data</html>'), null);
});

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>Test Album</title>
 <entry>
  <id>yt:video:aaaaaaaaaaa</id>
  <yt:videoId>aaaaaaaaaaa</yt:videoId>
  <title>First &amp; Song</title>
  <media:thumbnail url="https://example.test/1.jpg" width="480" height="360"/>
 </entry>
 <entry>
  <id>yt:video:bbbbbbbbbbb</id>
  <yt:videoId>bbbbbbbbbbb</yt:videoId>
  <title>Second song</title>
  <media:thumbnail url="https://example.test/2.jpg" width="480" height="360"/>
 </entry>
</feed>`;

test('a playlist RSS feed becomes a song list with its pictures', () => {
  const data = readYouTubeFeed(FEED);
  assert.equal(data.title, 'Test Album');
  assert.deepEqual(data.tracks.map((track) => [track.id, track.title, track.cover]), [
    ['aaaaaaaaaaa', 'First & Song', 'https://example.test/1.jpg'],
    ['bbbbbbbbbbb', 'Second song', 'https://example.test/2.jpg'],
  ]);
  assert.equal(readYouTubeFeed('<html>no data</html>'), null);
});

test('a playlist page failure falls back to the RSS feed', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/feeds/videos.xml')) return new Response(FEED, { status: 200 });
    return new Response('nope', { status: 500 });
  };
  try {
    const data = await loadYouTubePlaylist('OLAK5uy_feedfallbacktest', { force: true });
    assert.equal(data.title, 'Test Album');
    assert.deepEqual(data.tracks.map((track) => track.id), ['aaaaaaaaaaa', 'bbbbbbbbbbb']);
    assert.equal(calls.length, 2);
    assert.match(calls[0], /music\.youtube\.com\/playlist/);
    assert.match(calls[1], /feeds\/videos\.xml/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
