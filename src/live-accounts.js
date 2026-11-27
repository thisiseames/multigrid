// Saved live channels for the Live menu. TikTok lives are their own tile kind; Twitch and Kick
// are their normal channel links, kept in the Twitch and Kick folders. Adding accepts a full
// link, an @name or a plain name, and the link decides the platform when it is pasted.

import { parseSource } from './sources.js';
import { parseYouTubeLiveInput, youtubeChannelIdOf } from './youtube-live.js';

export const LIVE_PLATFORMS = ['tiktok', 'twitch', 'kick', 'youtube'];

const TWITCH_NAME = /^\w{2,25}$/;
const KICK_NAME = /^[A-Za-z0-9_.-]{2,30}$/;
const LINK = /^(?:(?:https?:)?\/\/|[\w-]+(?:\.[\w-]+)+[/:?#]|[\w-]+(?:\.[\w-]+)+$)/i;

/** The platform a pasted link belongs to, even before it is checked as a channel. */
export function livePlatformFrom(value) {
  const text = String(value ?? '').trim().toLocaleLowerCase();
  if (!text) return '';
  if (/^tiktoklive:/.test(text) || /^(?:(?:https?:)?\/\/)?(?:www\.|m\.)?tiktok\.com\//.test(text)) return 'tiktok';
  if (/^(?:(?:https?:)?\/\/)?(?:www\.|m\.)?twitch\.tv\//.test(text)
    || /^(?:(?:https?:)?\/\/)?(?:clips|player)\.twitch\.tv\//.test(text)) return 'twitch';
  if (/^(?:(?:https?:)?\/\/)?(?:www\.)?kick\.com\//.test(text)
    || /^(?:(?:https?:)?\/\/)?player\.kick\.com\//.test(text)) return 'kick';
  if (/^uc[\w-]{22}$/i.test(text)
    || /^(?:(?:https?:)?\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//.test(text)
    || /^(?:(?:https?:)?\/\/)?(?:www\.)?youtube-nocookie\.com\//.test(text)) return 'youtube';
  return '';
}

/** The saved account a link or tile input belongs to, or null. */
export function liveAccountOf(input) {
  const source = parseSource(input);
  if (source.kind === 'tiktoklive') {
    const username = source.tiktoklive.username;
    return { platform: 'tiktok', handle: username, username, key: `tiktok:${username.toLocaleLowerCase()}` };
  }
  if (source.kind === 'twitch' && source.twitch?.type === 'channel') {
    const username = source.twitch.id;
    return { platform: 'twitch', handle: username, username, key: `twitch:${username.toLocaleLowerCase()}` };
  }
  if (source.kind === 'kick' && source.kick?.path) {
    const username = source.kick.path.trim();
    // A player link can carry more than one segment; only a channel belongs in the Live menu.
    if (!username || username.includes('/')) return null;
    return { platform: 'kick', handle: username, username, key: `kick:${username.toLocaleLowerCase()}` };
  }
  if (source.kind === 'youtube') {
    const channelId = youtubeChannelIdOf(input);
    if (!channelId) return null;
    return { platform: 'youtube', handle: channelId, username: channelId, key: `youtube:${channelId.toLocaleLowerCase()}` };
  }
  return null;
}

function tiktokHandle(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const asUrl = /^(https?:\/\/|(?:www\.)?tiktok\.com\/)/i.test(text);
  const source = parseSource(asUrl || /^tiktoklive:/i.test(text) ? text : `tiktoklive:${text.replace(/^@/, '')}`);
  if (source.kind === 'tiktoklive') return source.tiktoklive.username;
  if (source.kind === 'tiktok' && source.tiktok?.profile) return source.tiktok.profile;
  return '';
}

/**
 * Reads what was typed into a platform's Add box. A full link of another platform changes
 * the platform. Returns { platform, handle, name, input } or null.
 */
export function parseLiveInput(platform, value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const chosen = livePlatformFrom(text) || platform;
  if (!LIVE_PLATFORMS.includes(chosen)) return null;

  if (chosen === 'youtube') return parseYouTubeLiveInput(text);

  if (chosen === 'tiktok') {
    const username = tiktokHandle(text);
    if (!username) return null;
    return { platform: 'tiktok', handle: username, name: `@${username}`, input: `tiktoklive:${username}` };
  }

  const link = LINK.test(text) ? parseSource(text) : null;
  if (chosen === 'twitch') {
    let username = '';
    if (link) {
      if (!(link.ok && link.kind === 'twitch' && link.twitch?.type === 'channel')) return null;
      username = link.twitch.id;
    } else {
      username = text.replace(/^@/, '');
      if (!TWITCH_NAME.test(username)) return null;
    }
    username = username.toLocaleLowerCase();
    return { platform: 'twitch', handle: username, name: username, input: `https://www.twitch.tv/${username}` };
  }

  let username = '';
  if (link) {
    if (!(link.ok && link.kind === 'kick' && link.kick?.path)) return null;
    username = link.kick.path;
  } else {
    username = text.replace(/^@/, '');
    if (!KICK_NAME.test(username)) return null;
  }
  username = username.toLocaleLowerCase();
  if (!KICK_NAME.test(username)) return null;
  return { platform: 'kick', handle: username, name: username, input: `https://kick.com/${username}` };
}
