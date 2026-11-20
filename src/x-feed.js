// Reads an X account's recent video posts from the page a reader returns.
// Pure text in, post ids and a video address out, so it can be tested without a browser.

const VIDEO_MARK = /\[Video \d+\]|amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb/i;
const ANCHOR = /\[\]\(https:\/\/x\.com\/([^/\s)]+)\/status\/(\d{10,25})\)/gi;

/**
 * The account's recent posts that contain video, newest first.
 * `text` is the Markdown the reader gives for x.com/<handle>.
 */
export function parseXProfile(text, handle) {
  const wanted = String(handle || '').toLowerCase();
  const body = String(text || '');
  const matches = [...body.matchAll(ANCHOR)];
  const ids = [];
  let posts = 0;
  matches.forEach((match, index) => {
    if (wanted && match[1].toLowerCase() !== wanted) return;
    const end = index + 1 < matches.length ? matches[index + 1].index : body.length;
    const block = body.slice(match.index, end);
    posts++;
    if (VIDEO_MARK.test(block) && !ids.includes(match[2])) ids.push(match[2]);
  });
  return { ids, posts };
}

const unescapeUrl = (raw) => raw
  .replace(/\\u002F/gi, '/')
  .replace(/\\\//g, '/')
  .replace(/&amp;/g, '&')
  .replace(/\\+$/, '');

const sizeOf = (url) => {
  const match = url.match(/\/(\d+)x(\d+)\//);
  return match ? Number(match[1]) * Number(match[2]) : 0;
};

/** The best MP4 address in a post's page, or '' when the post has no plain video file. */
export function parseXVideoPage(html) {
  const text = String(html || '').replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
  const found = [...text.matchAll(/https:\/\/video\.twimg\.com[^\s"'\\<]*?\.mp4[^\s"'\\<]*/g)]
    .map((match) => unescapeUrl(match[0]));
  if (!found.length) return '';
  return found.sort((a, b) => sizeOf(b) - sizeOf(a))[0];
}

const HANDLE_ONLY = /^@([A-Za-z0-9_]{1,15})$/;
const PROFILE_LINK = /^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/i;

/**
 * Usernames out of a copied X list: the members panel as it pastes (name, @handle, bio,
 * one member per blank-line block), one handle per line, or a CSV with a handle field.
 */
export function parseXList(text) {
  const body = String(text || '');
  const found = [];
  const take = (name) => {
    const clean = String(name).trim().replace(/^@/, '');
    if (/^[A-Za-z0-9_]{1,15}$/.test(clean)) found.push(clean);
  };
  const firstIn = (lines) => {
    for (const line of lines) {
      const handle = line.match(HANDLE_ONLY);
      if (handle) return handle[1];
      const link = line.match(PROFILE_LINK);
      if (link) return link[1];
    }
    return '';
  };

  // The list panel: each member block holds its handle before any bio mentions.
  const blocks = body.split(/\n\s*\n/)
    .map((block) => block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length);
  const fromBlocks = blocks.map(firstIn).filter(Boolean);
  if (/\n\s*\n/.test(body) && fromBlocks.length >= 2) {
    fromBlocks.forEach(take);
  } else {
    // One handle or profile link per line.
    const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const handle = line.match(/^@?([A-Za-z0-9_]{1,15})$/);
      if (handle) {
        take(handle[1]);
        continue;
      }
      const link = line.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i);
      if (link) take(link[1]);
    }
    // Still nothing: a CSV, with the handle field found by its header.
    if (!found.length) {
      const rows = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        .map((line) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')));
      const header = rows[0]?.findIndex((cell) => /^(handle|username|user|account)$/i.test(cell)) ?? -1;
      if (header >= 0) for (const row of rows.slice(1)) if (row[header]) take(row[header]);
      else for (const row of rows) for (const cell of row) {
        const link = cell.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i);
        if (link) take(link[1]);
      }
    }
  }
  const seen = new Set();
  return found
    .map((name) => name.toLowerCase())
    .filter((name) => {
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
}

/** The account's post ids in a profile's HTML: its own links, wherever they sit. */
export function parseXProfileHtml(html, handle) {
  const body = String(html || '');
  const wanted = String(handle || '');
  if (!wanted) return { ids: [], posts: 0 };
  const safe = wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`/${safe}/status/(\\d{10,25})`, 'gi');
  const ids = [];
  for (const match of body.matchAll(pattern)) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return { ids, posts: ids.length };
}

/** When an X post was made, from its id (X counts milliseconds from November 2010). */
export function xPostedAt(id) {
  try {
    return Number((BigInt(id) >> 22n) + 1288834974657n);
  } catch {
    return 0;
  }
}
