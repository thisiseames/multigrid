import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSource, buildEmbedUrl, extractIframeSrc, isBlockedMixedContent } from '../src/sources.js';

const env = { hostname: 'thisiseames.github.io', origin: 'https://thisiseames.github.io', protocol: 'https:' };
const embed = (input, opts = { muted: true, autoplay: true }) => {
  const source = parseSource(input);
  assert.equal(source.ok, true, `${input}: ${source.error}`);
  return { source, url: new URL(buildEmbedUrl(source, opts, env)) };
};

const youtube = [
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://youtube.com/watch?list=PL1&v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/live/dQw4w9WgXcQ?feature=share', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['//www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
];
for (const [input, id] of youtube) {
  test(`youtube: ${input}`, () => {
    const { source, url } = embed(input);
    assert.equal(source.kind, 'youtube');
    assert.equal(url.pathname, `/embed/${id}`);
    assert.equal(url.searchParams.get('enablejsapi'), '1');
    assert.equal(url.searchParams.get('origin'), env.origin);
  });
}

test('youtube: start time carries over', () => {
  assert.equal(embed('https://youtu.be/dQw4w9WgXcQ?t=1m30s').url.searchParams.get('start'), '90');
  assert.equal(embed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=45').url.searchParams.get('start'), '45');
});

test('youtube: live channel id and playlists', () => {
  const channel = embed('https://www.youtube.com/channel/UCabc123/live').url;
  assert.equal(channel.pathname, '/embed/live_stream');
  assert.equal(channel.searchParams.get('channel'), 'UCabc123');
  const embedded = embed('https://www.youtube.com/embed/live_stream?channel=UCabc123').url;
  assert.equal(embedded.pathname, '/embed/live_stream');
  const list = embed('https://www.youtube.com/playlist?list=PLxyz').url;
  assert.equal(list.pathname, '/embed/videoseries');
  assert.equal(list.searchParams.get('list'), 'PLxyz');
});

test('youtube: privacy host stays private', () => {
  assert.equal(embed('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ').url.hostname, 'www.youtube-nocookie.com');
});

test('youtube: channel names explain themselves instead of pretending', () => {
  for (const input of ['https://www.youtube.com/@NASA/live', 'https://www.youtube.com/@NASA', 'https://www.youtube.com/c/NASA']) {
    const result = parseSource(input);
    assert.equal(result.ok, false);
    assert.match(result.error, /Share button/);
  }
  assert.equal(parseSource('https://www.youtube.com/feed/trending').ok, false);
  assert.equal(parseSource('https://www.youtube.com/watch').ok, false);
});

test('twitch: channel, video and clip links all carry the real parent', () => {
  const channel = embed('https://www.twitch.tv/Shroud').url;
  assert.equal(channel.origin + channel.pathname, 'https://player.twitch.tv/');
  assert.equal(channel.searchParams.get('channel'), 'shroud');
  assert.equal(channel.searchParams.get('parent'), env.hostname);

  const video = embed('https://www.twitch.tv/videos/1234567?t=1h2m3s').url;
  assert.equal(video.searchParams.get('video'), 'v1234567');
  assert.equal(video.searchParams.get('time'), '1h2m3s');
  assert.equal(video.searchParams.get('parent'), env.hostname);

  for (const input of [
    'https://www.twitch.tv/shroud/clip/FunnyClipName-abc',
    'https://clips.twitch.tv/FunnyClipName-abc',
    'https://clips.twitch.tv/embed?clip=FunnyClipName-abc&parent=other.example',
    'https://m.twitch.tv/shroud/clip/FunnyClipName-abc',
  ]) {
    const clip = embed(input).url;
    assert.equal(clip.origin + clip.pathname, 'https://clips.twitch.tv/embed', input);
    assert.equal(clip.searchParams.get('clip'), 'FunnyClipName-abc', input);
    assert.deepEqual(clip.searchParams.getAll('parent'), [env.hostname], input);
  }
});

test('twitch: pasted player links replace someone else\'s parent', () => {
  const url = embed('https://player.twitch.tv/?channel=shroud&parent=someoneelse.example').url;
  assert.deepEqual(url.searchParams.getAll('parent'), [env.hostname]);
  assert.equal(embed('https://player.twitch.tv/?video=v123&parent=x.example').url.searchParams.get('video'), 'v123');
});

test('twitch: site pages are not channels', () => {
  assert.equal(parseSource('https://www.twitch.tv/directory').ok, false);
  assert.equal(parseSource('https://www.twitch.tv/').ok, false);
});

test('kick: channels and player links', () => {
  const url = embed('https://kick.com/xQc').url;
  assert.equal(url.origin + url.pathname, 'https://player.kick.com/xqc');
  assert.equal(url.searchParams.get('muted'), 'true');
  assert.equal(url.searchParams.get('autoplay'), 'true');
  assert.equal(embed('https://player.kick.com/xqc?muted=false').url.pathname, '/xqc');
  assert.equal(parseSource('https://kick.com/browse').ok, false);
  assert.equal(parseSource('https://kick.com/xqc/videos/abc-123').kind, 'iframe');
});

test('hls: direct streams', () => {
  const source = parseSource('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
  assert.equal(source.kind, 'hls');
  assert.equal(parseSource('https://cdn.example.com/live/index.M3U8?token=abc').kind, 'hls');
  assert.equal(isBlockedMixedContent(parseSource('http://cdn.example.com/a.m3u8'), env), true);
  assert.equal(isBlockedMixedContent(parseSource('https://cdn.example.com/a.m3u8'), env), false);
  assert.equal(isBlockedMixedContent(parseSource('http://cdn.example.com/a.m3u8'), { protocol: 'http:' }), false);
});

test('iframe code: src is extracted, including hard cases', () => {
  assert.equal(extractIframeSrc('<iframe width="560" src="https://a.example/x" title="y"></iframe>'), 'https://a.example/x');
  assert.equal(extractIframeSrc("<iframe src='https://a.example/x'></iframe>"), 'https://a.example/x');
  assert.equal(extractIframeSrc('<IFRAME SRC=https://a.example/x allowfullscreen></IFRAME>'), 'https://a.example/x');
  assert.equal(extractIframeSrc('<iframe src="https://a.example/x?a=1&amp;b=2"></iframe>'), 'https://a.example/x?a=1&b=2');
  assert.equal(extractIframeSrc('<iframe data-src="https://bad.example" src="https://good.example"></iframe>'), 'https://good.example');
  assert.equal(extractIframeSrc('<iframe title="a > b" src="https://a.example/x"></iframe>'), 'https://a.example/x');
  assert.equal(extractIframeSrc('<iframe\n  width="1"\n  src="https://a.example/x"\n></iframe>'), 'https://a.example/x');
  assert.equal(extractIframeSrc('<iframe width="1"></iframe>'), null);
  assert.equal(extractIframeSrc('<div>hello</div>'), null);
});

test('iframe code: known providers are still recognised', () => {
  const youtube = parseSource('<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=abc" frameborder="0" allowfullscreen></iframe>');
  assert.equal(youtube.kind, 'youtube');
  assert.equal(youtube.youtube.id, 'dQw4w9WgXcQ');
  const twitch = parseSource('<iframe src="https://player.twitch.tv/?channel=shroud&parent=www.example.com" height="378"></iframe>');
  assert.equal(twitch.kind, 'twitch');
  assert.equal(twitch.twitch.id, 'shroud');
});

test('iframe code: dangerous values never get through', () => {
  for (const input of [
    '<iframe src="javascript:alert(1)"></iframe>',
    '<iframe src="JaVaScRiPt:alert(1)"></iframe>',
    '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///etc/passwd',
  ]) {
    assert.equal(parseSource(input).ok, false, input);
  }
});

test('other sites: no whitelist, anything http or https is tried', () => {
  const vimeo = parseSource('https://player.vimeo.com/video/76979871');
  assert.equal(vimeo.kind, 'iframe');
  assert.equal(vimeo.url, 'https://player.vimeo.com/video/76979871');
  assert.equal(parseSource('example.com/player').kind, 'iframe');
  assert.equal(parseSource('http://localhost:8080/player').kind, 'iframe');
});

test('nonsense gets a useful message', () => {
  assert.equal(parseSource('').ok, false);
  assert.equal(parseSource('   ').ok, false);
  assert.equal(parseSource('shroud').ok, false);
  assert.equal(parseSource('not a link at all').ok, false);
});
