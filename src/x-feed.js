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
