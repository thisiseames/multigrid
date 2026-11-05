// Source parsing: turns whatever the user pasted into a described, playable source.
// Pure logic with no DOM, so it can be tested on its own. Pasted HTML is only ever
// read as text here; it is never rendered.

const YOUTUBE_HOSTS = new Set([
  'youtube.com', 'm.youtube.com', 'music.youtube.com', 'gaming.youtube.com',
  'youtube-nocookie.com', 'youtu.be',
]);
const TWITCH_HOSTS = new Set(['twitch.tv', 'm.twitch.tv']);
const TWITCH_RESERVED = new Set([
  'directory', 'downloads', 'jobs', 'p', 'settings', 'subscriptions', 'inventory',
  'drops', 'wallet', 'friends', 'messages', 'search', 'turbo', 'prime', 'popout',
  'moderator', 'broadcast', 'store',
]);
const KICK_RESERVED = new Set([
  'categories', 'browse', 'following', 'search', 'dashboard', 'clips', 'video',
  'videos', 'community-guidelines', 'privacy-policy', 'terms-of-service', 'dmca-policy',
  'settings', 'subscriptions', 'transactions',
]);

const fail = (input, error) => ({ ok: false, input, error });

const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const hex = code[1].toLowerCase() === 'x';
      const value = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(value) && value <= 0x10ffff ? String.fromCodePoint(value) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Reads the src attribute out of pasted iframe HTML. Returns null if there isn't one. */
export function extractIframeSrc(html) {
  const tag = html.match(/<iframe\b((?:[^>"']|"[^"]*"|'[^']*')*)>?/i);
  if (!tag) return null;
  const attribute = /([^\s=/>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag[1].matchAll(attribute)) {
    if (match[1].toLowerCase() === 'src') {
      return decodeEntities(match[2] ?? match[3] ?? match[4] ?? '').trim();
    }
  }
  return null;
}

function toUrl(text) {
  let candidate = text;
  if (candidate.startsWith('//')) candidate = `https:${candidate}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    if (!/^[\w-]+(\.[\w-]+)+([/:?#]|$)/.test(candidate)) return null;
    candidate = `https://${candidate}`;
  }
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

/** Accepts 90, 90s, 1m30s, 1h2m3s. Returns whole seconds, or 0. */
function parseTime(value) {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const parts = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!parts) return 0;
  return Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0);
}

const toTwitchTime = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h${m}m${seconds % 60}s`;
};

function parseYouTube(url, host, input) {
  const segments = url.pathname.split('/').filter(Boolean);
  const params = url.searchParams;
  const start = parseTime(params.get('start') || params.get('t'));
  const nocookie = host === 'youtube-nocookie.com';
  const make = (spec, labelText) => ({
    ok: true, input, kind: 'youtube', label: `YouTube · ${labelText}`,
    openUrl: url.href, youtube: { ...spec, start, nocookie },
  });
  const video = (id) => (/^[\w-]{6,}$/.test(id || '') ? make({ id, list: params.get('list') }, id) : null);

  if (host === 'youtu.be') {
    return video(segments[0]) || fail(input, 'This youtu.be link has no video ID.');
  }

  const [first, second, third] = segments;
  if (first === 'watch') {
    return video(params.get('v')) || fail(input, 'This YouTube link has no video ID.');
  }
  if (first === 'playlist' && params.get('list')) {
    return make({ list: params.get('list') }, 'playlist');
  }
  if (first === 'embed') {
    if (second === 'live_stream' && params.get('channel')) {
      return make({ channel: params.get('channel') }, 'live channel');
    }
    if ((second === 'videoseries' || !second) && params.get('list')) {
      return make({ list: params.get('list') }, 'playlist');
    }
    return video(second) || fail(input, 'This YouTube embed link has no video ID.');
  }
  if (first === 'live' || first === 'shorts' || first === 'v' || first === 'e') {
    return video(second) || fail(input, 'This YouTube link has no video ID.');
  }
  // Every channel has a playlist of its uploads, newest first: its ID with UC changed to UU.
  if (first === 'channel' && /^UC[\w-]+$/.test(second || '') && third === 'videos') {
    return make({ list: `UU${second.slice(2)}` }, 'channel');
  }
  if (first === 'channel' && /^UC[\w-]+$/.test(second || '') && (third === 'live' || !third)) {
    return make({ channel: second }, 'live channel');
  }
  if (first?.startsWith('@') || first === 'c' || first === 'user') {
    return fail(input, "YouTube can't play a channel by its name in another site. For its newest videos, paste the channel ID instead: on the channel's page, click …more, then Share channel, then Copy channel ID. For a live stream, copy the link from its Share button.");
  }
  return fail(input, "This YouTube page isn't a video. Paste a link to a video, live stream or playlist.");
}

function parseTwitch(url, host, input) {
  const segments = url.pathname.split('/').filter(Boolean);
  const params = url.searchParams;
  const time = parseTime(params.get('t') || params.get('time'));
  const make = (type, id) => ({
    ok: true, input, kind: 'twitch',
    label: `Twitch · ${type === 'channel' ? id : `${type} ${id}`}`,
    openUrl: url.href,
    twitch: { type, id, time },
  });
  const videoId = (value) => String(value).replace(/^v/, '');

  if (host === 'clips.twitch.tv') {
    const slug = params.get('clip') || (segments[0] !== 'embed' ? segments[0] : null);
    return slug ? make('clip', slug) : fail(input, 'This Twitch clip link has no clip name.');
  }
  if (host === 'player.twitch.tv') {
    if (params.get('channel')) return make('channel', params.get('channel'));
    if (params.get('video')) return make('video', videoId(params.get('video')));
    if (params.get('collection')) return make('collection', params.get('collection'));
    return fail(input, 'This Twitch player link has no channel or video.');
  }

  const [first, second, third] = segments;
  if (!first) return fail(input, 'Paste a link to a Twitch channel, video or clip.');
  if ((first === 'videos' || first === 'video') && /^\d+$/.test(second || '')) return make('video', second);
  if (first === 'collections' && second) return make('collection', second);
  if (TWITCH_RESERVED.has(first.toLowerCase()) || first === 'videos') {
    return fail(input, "This Twitch page isn't a channel, video or clip.");
  }
  if (second === 'clip' && third) return make('clip', third);
  if ((second === 'video' || second === 'v') && /^\d+$/.test(third || '')) return make('video', third);
  if (!/^\w{2,25}$/.test(first)) return fail(input, "That doesn't look like a Twitch channel name.");
  return make('channel', first.toLowerCase());
}

const SHORT_LINK = 'Short links can\'t be opened from here. Open it, then copy the full address.';

function parseTikTok(url, host, input) {
  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') return fail(input, SHORT_LINK);
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 't') return fail(input, SHORT_LINK);
  const make = (id, author) => ({
    ok: true, input, kind: 'tiktok',
    label: `TikTok · ${author || id}`,
    openUrl: url.href,
    tiktok: { id },
  });
  const [first, second, third] = segments;
  if (first === 'player' && second === 'v1' && /^\d+$/.test(third || '')) return make(third);
  if (first === 'embed') {
    const id = segments.find((part) => /^\d{6,}$/.test(part));
    if (id) return make(id);
  }
  if (first?.startsWith('@') && second === 'video' && /^\d+$/.test(third || '')) return make(third, first);
  return fail(input, "This TikTok page isn't a video. Paste the link to one video.");
}

function parseX(url, host, input) {
  if (host === 't.co') return fail(input, SHORT_LINK);
  const make = (id, author) => ({
    ok: true, input, kind: 'x',
    label: `X · ${author && author !== 'i' ? `@${author}` : id}`,
    openUrl: url.href,
    x: { id },
  });
  if (host === 'platform.twitter.com') {
    const id = url.searchParams.get('id');
    return /^\d+$/.test(id || '') ? make(id) : fail(input, 'This X player link has no post in it.');
  }
  const segments = url.pathname.split('/').filter(Boolean);
  const status = segments.findIndex((part) => part === 'status' || part === 'statuses');
  if (status >= 0 && /^\d+$/.test(segments[status + 1] || '')) {
    return make(segments[status + 1], status > 0 ? segments[status - 1] : null);
  }
  return fail(input, "This X page isn't a post. Paste the link to the post with the video.");
}

function parseLocal(input) {
  const match = input.match(/^local:([\w-]+):(.*)$/s);
  if (!match) return fail(input, "That isn't a link. Paste a full address or iframe code.");
  let name = match[2];
  try {
    name = decodeURIComponent(name);
  } catch {
    // A damaged name still identifies the file; show it as it is.
  }
  return { ok: true, input, kind: 'file', label: name, name, localId: match[1], openUrl: null };
}

/** The stored form of a file on this computer. The file itself is never stored. */
export const localInput = (id, name) => `local:${id}:${encodeURIComponent(name)}`;

function parseKick(url, host, input) {
  const segments = url.pathname.split('/').filter(Boolean);
  const make = (path) => ({
    ok: true, input, kind: 'kick', label: `Kick · ${path}`,
    openUrl: host === 'player.kick.com' ? `https://kick.com/${path}` : url.href,
    kick: { path },
  });
  if (host === 'player.kick.com') {
    return segments.length ? make(segments.join('/')) : fail(input, 'This Kick player link has no channel.');
  }
  const [channel, section] = segments;
  if (!channel) return fail(input, 'Paste a link to a Kick channel.');
  if (KICK_RESERVED.has(channel.toLowerCase())) return fail(input, "This Kick page isn't a channel.");
  if (segments.length === 1 || (segments.length === 2 && (section === 'videos' || section === 'clips'))) {
    return make(channel.toLowerCase());
  }
  return null; // A specific Kick video or clip: Kick has no official player, so try it as a page.
}

/**
 * The main entry point. Always returns a plain object: either
 * { ok: true, input, kind, label, openUrl, ... } or { ok: false, input, error }.
 */
export function parseSource(raw) {
  const input = String(raw ?? '').trim();
  if (!input) return fail(input, 'Paste a link or iframe code.');
  if (input.startsWith('local:')) return parseLocal(input);

  let text = input;
  if (/^</.test(input) || /<iframe\b/i.test(input)) {
    const src = extractIframeSrc(input);
    if (!src) return fail(input, "That code has no iframe with a src, so there's nothing to play.");
    text = src;
  }

  // A YouTube channel ID on its own, as YouTube's "Copy channel ID" gives it.
  if (/^UC[\w-]{22}$/.test(text)) {
    return parseYouTube(new URL(`https://www.youtube.com/channel/${text}/videos`), 'youtube.com', input);
  }

  const url = toUrl(text);
  if (!url) return fail(input, "That isn't a link. Paste a full address or iframe code.");
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return fail(input, 'Only http and https links can be played.');
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  if (YOUTUBE_HOSTS.has(host)) return parseYouTube(url, host, input);
  if (TWITCH_HOSTS.has(host) || host === 'clips.twitch.tv' || host === 'player.twitch.tv') {
    return parseTwitch(url, host, input);
  }
  if (host === 'kick.com' || host === 'player.kick.com') {
    const kick = parseKick(url, host, input);
    if (kick) return kick;
  }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return parseTikTok(url, host, input);
  if (host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com' || host === 'mobile.x.com'
    || host === 'platform.twitter.com' || host === 't.co') {
    return parseX(url, host, input);
  }
  if (/\.m3u8$/i.test(url.pathname)) {
    return { ok: true, input, kind: 'hls', label: `HLS · ${host}`, openUrl: url.href, url: url.href };
  }
  return { ok: true, input, kind: 'iframe', label: host, openUrl: url.href, url: url.href };
}

/** An http link is blocked by browsers on a secure page. Applies to direct links only. */
export function isBlockedMixedContent(source, env) {
  if (source.kind !== 'iframe' && source.kind !== 'hls') return false;
  return env.protocol === 'https:' && source.url.startsWith('http:');
}

/** The address of the player for a source. Muted and autoplay are decided per tile. */
export function buildEmbedUrl(source, { muted, autoplay }, env) {
  if (source.kind === 'youtube') {
    const { id, list, channel, start, nocookie } = source.youtube;
    const base = `https://www.${nocookie ? 'youtube-nocookie' : 'youtube'}.com/embed/`;
    const params = new URLSearchParams({
      enablejsapi: '1',
      origin: env.origin,
      playsinline: '1',
      rel: '0',
      autoplay: autoplay ? '1' : '0',
      mute: muted ? '1' : '0',
    });
    if (start) params.set('start', String(start));
    if (channel) {
      params.set('channel', channel);
      return `${base}live_stream?${params}`;
    }
    if (list) params.set('list', list);
    return `${base}${id || 'videoseries'}?${params}`;
  }
  if (source.kind === 'twitch') {
    const { type, id, time } = source.twitch;
    const params = new URLSearchParams();
    if (type === 'clip') {
      params.set('clip', id);
    } else {
      params.set(type, type === 'video' ? `v${id}` : id);
      if (time) params.set('time', toTwitchTime(time));
    }
    // Twitch refuses to play unless told which site it is on. This is read from the
    // address the app is really running at, so it works on any domain it's deployed to.
    params.set('parent', env.hostname);
    params.set('muted', String(Boolean(muted)));
    params.set('autoplay', String(Boolean(autoplay)));
    return `${type === 'clip' ? 'https://clips.twitch.tv/embed' : 'https://player.twitch.tv/'}?${params}`;
  }
  if (source.kind === 'kick') {
    const params = new URLSearchParams({ muted: String(Boolean(muted)), autoplay: String(Boolean(autoplay)) });
    return `https://player.kick.com/${source.kick.path}?${params}`;
  }
  if (source.kind === 'tiktok') {
    // TikTok has no "start muted" setting that can be undone, so sound is set by message.
    return `https://www.tiktok.com/player/v1/${source.tiktok.id}?autoplay=${autoplay ? 1 : 0}&rel=0`;
  }
  if (source.kind === 'x') {
    return `https://platform.twitter.com/embed/Tweet.html?id=${source.x.id}&theme=dark&dnt=true&hideThread=true`;
  }
  return source.url;
}
