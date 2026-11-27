// YouTube live status and channel lookup. YouTube pages don't send CORS headers, so the same
// free r.jina.ai reader the rest of MULTIGRID uses reads the channel's /live page. A live page
// shows "Channel name  74,000 watching now" near the top; an offline channel page does not.
// Asking for every YouTube channel is heavier than Twitch or Kick, so statuses are kept for
// five minutes and read two at a time, with a gap, inside the reader's free limit.

import { parseSource } from './sources.js';

const READER = 'https://r.jina.ai/';
const STATUS_TTL = 5 * 60 * 1000;
const PAGE_TTL = 5 * 60 * 1000;
const GAP = 800;
const WORKERS = 2;

const pageCache = new Map();
const statuses = new Map();
const queue = [];
let running = 0;

async function work() {
  running++;
  while (queue.length) {
    const job = queue.shift();
    let text = '';
    try {
      const response = await fetch(`${READER}${job.url}`, {
        cache: 'no-cache',
        signal: AbortSignal.timeout?.(20000),
        headers: { accept: 'text/plain' },
      });
      if (response.ok) text = await response.text();
    } catch { /* the Live row stays Checking, or keeps its last status */ }
    job.resolve(text);
    if (queue.length) await new Promise((wait) => setTimeout(wait, GAP));
  }
  running--;
}

const pump = () => { while (running < WORKERS && running < queue.length) work(); };

function readPage(url) {
  const known = pageCache.get(url);
  if (known && Date.now() - known.at < PAGE_TTL) return Promise.resolve(known.text);
  if (known?.ask) return known.ask;
  const ask = new Promise((resolve) => { queue.push({ url, resolve }); pump(); })
    .then((text) => {
      if (text) pageCache.set(url, { at: Date.now(), text });
      else pageCache.delete(url);
      return text;
    });
  pageCache.set(url, { at: 0, text: '', ask });
  return ask;
}

const cleanName = (value) => String(value || '')
  .replace(/\s+-\s+YouTube\s*$/i, '')
  .replace(/\s+/g, ' ')
  .trim();

const titleOf = (text) => cleanName(String(text || '').match(/^Title:\s*(.+)$/m)?.[1] || '');

const handleOf = (value) => String(value || '')
  .match(/(?:youtube(?:-nocookie)?\.com\/|^)@([A-Za-z0-9_.-]{2,30})(?:\/|$|[?#])/i)?.[1] || '';

const watchTime = (text) => {
  const match = String(text || '').match(/([\d][\d,.]*)\s*([KMB])?\s+watching\s+now/i);
  if (!match) return 0;
  const value = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return 0;
  const scale = { K: 1000, M: 1000000, B: 1000000000 }[String(match[2] || '').toUpperCase()] || 1;
  return Math.round(value * scale);
};

/** The live/offline details in a YouTube channel's /live reader page. */
export function readYouTubeLive(text, fallbackName = '') {
  const raw = String(text || '');
  if (!raw) return null;
  const title = titleOf(raw);
  // The live player's own count sits near the top; recommendations below it also say
  // "watching", so only the first 60 lines count.
  const head = raw.split(/\r?\n/).slice(0, 60).join('\n');
  const viewers = watchTime(head);
  const live = /watching\s+now/i.test(head);
  return {
    live,
    username: '',
    name: fallbackName || title || 'YouTube',
    title: live ? title : '',
    viewers,
    avatar: '',
  };
}

/** The YouTube channel ID in a channel link, uploads feed, embed or Live link. */
export function youtubeChannelIdOf(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^UC[\w-]{22}$/.test(text)) return text;
  const source = parseSource(text);
  if (source.kind === 'youtube') {
    if (source.youtube.channel) return source.youtube.channel;
    // An uploads feed's playlist is the channel ID with UC changed to UU.
    if (source.youtube.list?.startsWith('UU') && /^UU[\w-]{22}$/.test(source.youtube.list)) {
      return `UC${source.youtube.list.slice(2)}`;
    }
  }
  return text.match(/youtube(?:-nocookie)?\.com\/channel\/(UC[\w-]{22})/i)?.[1]
    || text.match(/[?&]channel=(UC[\w-]{22})/i)?.[1]
    || text.match(/"channelId"\s*:\s*"(UC[\w-]{22})"/i)?.[1]
    || '';
}

export const youtubeLiveInput = (channelId) => `https://www.youtube.com/channel/${channelId}/live`;

/** What was pasted into the YouTube Add box, before the channel is looked up. */
export function parseYouTubeLiveInput(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const channelId = youtubeChannelIdOf(text);
  if (channelId) return { platform: 'youtube', channelId, handle: '', name: '', input: youtubeLiveInput(channelId) };
  const handle = handleOf(text);
  if (handle) {
    return { platform: 'youtube', handle, name: '', input: `https://www.youtube.com/@${handle}/live` };
  }
  const source = parseSource(text);
  if (source.kind === 'youtube' && source.youtube.id) {
    return { platform: 'youtube', videoId: source.youtube.id, handle: '', name: '', input: source.input };
  }
  if (/^[A-Za-z0-9_.-]{3,30}$/.test(text)) {
    return { platform: 'youtube', handle: text, name: '', input: `https://www.youtube.com/@${text}/live` };
  }
  return null;
}

/** Turns a handle, video link or bare channel link into a channel ID and a display name. */
export async function resolveYouTubeChannel(spec) {
  if (!spec) return null;
  if (spec.channelId) {
    const text = await readPage(`https://www.youtube.com/channel/${spec.channelId}`);
    return { channelId: spec.channelId, handle: spec.handle || '', name: titleOf(text) || spec.name || spec.channelId };
  }
  if (spec.handle) {
    const handle = String(spec.handle).replace(/^@/, '');
    const text = await readPage(`https://www.youtube.com/@${handle}`);
    const channelId = youtubeChannelIdOf(text);
    if (!channelId) return null;
    return { channelId, handle, name: titleOf(text) || handle };
  }
  if (spec.videoId) {
    const text = await readPage(`https://www.youtube.com/watch?v=${spec.videoId}`);
    const channelId = youtubeChannelIdOf(text);
    if (!channelId) return null;
    const handle = handleOf(text);
    const author = cleanName(text.match(/\[([^\]]+)\]\(https:\/\/www\.youtube\.com\/@[^)]+\)/)?.[1] || '');
    return { channelId, handle, name: author || handle || channelId };
  }
  return null;
}

/** Live/offline details for a YouTube channel, or null if the reader can't be reached. */
export function youtubeLiveStatus(channelId, fallbackName = '', { force = false } = {}) {
  const id = String(channelId || '').trim();
  if (!/^UC[\w-]{22}$/.test(id)) return Promise.resolve(null);
  if (force) statuses.delete(id);
  const known = statuses.get(id);
  if (known && Date.now() - known.at < STATUS_TTL) return known.ask;
  const ask = readPage(youtubeLiveInput(id))
    .then((text) => {
      const status = readYouTubeLive(text, fallbackName);
      // A reader miss is not a status: try this channel again on the next poll.
      if (!status) {
        const current = statuses.get(id);
        if (current?.ask === ask) statuses.delete(id);
      }
      return status;
    })
    .catch(() => null);
  statuses.set(id, { at: Date.now(), ask });
  return ask;
}
