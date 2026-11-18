// Makes the Reader: reader/index.json (headlines, each site's own summary and picture) and,
// for each new story, its cleaned-up text in reader/a/<id>.json, locked with READER_KEY.
// The project is public, so story text is only ever saved locked: anyone else sees noise.
// Run by .github/workflows/reader.yml about every 20 minutes.   node tools/build-reader.mjs

import { createHash, webcrypto } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { DOMParser, parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const ROOT = new URL('../reader/', import.meta.url);
const KEEP = 400;
const PER_FEED = 8;
const NEW_TEXTS_PER_RUN = 80;
const { feeds } = JSON.parse(readFileSync(new URL('feeds.json', ROOT)));
const previous = existsSync(new URL('index.json', ROOT)) ? JSON.parse(readFileSync(new URL('index.json', ROOT))) : { items: [] };
const known = new Map(previous.items.map((item) => [item.id, item]));
mkdirSync(new URL('a/', ROOT), { recursive: true });

const pause = (ms) => new Promise((done) => setTimeout(done, ms));
// Some sites (ESPN) send an empty page to anything that looks like a browser robot, but answer
// a plain feed reader, so a feed that comes back empty is asked once more under this name.
const PLAIN_UA = 'MULTIGRID-reader/1.0';
async function get(url, timeout = 20000, agent = UA) {
  const response = await fetch(url, { headers: { 'User-Agent': agent, Accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.text();
}

const text = (node) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
const first = (parent, names) => {
  for (const name of names) {
    const found = parent.getElementsByTagName(name)[0];
    if (found) return found;
  }
  return null;
};
const stripTags = (html) => text(parseHTML(`<div>${html}</div>`).document.querySelector('div'));
const absolute = (link, base) => {
  try { return new URL(link, base).href; } catch { return ''; }
};
const idOf = (link) => createHash('sha1').update(link).digest('hex').slice(0, 16);

/** One feed's newest entries, RSS or Atom. */
function entries(xml, feed) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const nodes = [...doc.getElementsByTagName('item'), ...doc.getElementsByTagName('entry')];
  return nodes.slice(0, 30).map((node) => {
    const linkNode = first(node, ['link']);
    let link = linkNode?.getAttribute?.('href') || text(linkNode);
    const youtube = first(node, ['yt:videoId']);
    const enclosure = [...node.getElementsByTagName('enclosure')].find((item) => /audio|video/.test(item.getAttribute('type') || ''));
    const thumb = first(node, ['media:thumbnail'])?.getAttribute('url')
      || [...node.getElementsByTagName('media:content')].find((item) => /image|jpe?g|png|webp/.test((item.getAttribute('type') || '') + (item.getAttribute('url') || '')))?.getAttribute('url')
      || [...node.getElementsByTagName('enclosure')].find((item) => /image/.test(item.getAttribute('type') || ''))?.getAttribute('url')
      || first(node, ['itunes:image'])?.getAttribute('href') || '';
    const when = Date.parse(text(first(node, ['pubDate', 'published', 'dc:date', 'updated'])));
    const rawSummary = text(first(node, ['description', 'summary', 'media:description', 'content']));
    const summary = stripTags(rawSummary).slice(0, 320);
    link = absolute(link || enclosure?.getAttribute('url') || '', feed.site || feed.url);
    const kind = youtube ? 'youtube' : enclosure ? 'podcast' : 'article';
    return {
      id: idOf(link || `${feed.url}${text(first(node, ['title']))}`),
      title: text(first(node, ['title'])) || '(no title)',
      source: feed.name,
      group: feed.group,
      time: Number.isFinite(when) ? when : Date.now(),
      link,
      image: thumb ? absolute(thumb, link) : '',
      summary,
      kind,
      video: youtube ? text(youtube) : undefined,
      audio: kind === 'podcast' ? enclosure.getAttribute('url') : undefined,
    };
  }).filter((item) => item.link);
}

/* Story text: only the tags a reader needs, with addresses made whole. */
const ALLOWED = new Set(['P', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'B', 'I', 'A', 'IMG', 'FIGURE', 'FIGCAPTION', 'BR']);
function clean(node, base, doc) {
  const out = doc.createDocumentFragment();
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) { out.append(doc.createTextNode(child.textContent)); continue; }
    if (child.nodeType !== 1) continue;
    const tag = child.tagName.toUpperCase();
    if (!ALLOWED.has(tag)) { out.append(clean(child, base, doc)); continue; }
    const copy = doc.createElement(tag.toLowerCase());
    if (tag === 'A') { const href = absolute(child.getAttribute('href') || '', base); if (/^https?:/.test(href)) copy.setAttribute('href', href); }
    if (tag === 'IMG') {
      const src = absolute(child.getAttribute('src') || child.getAttribute('data-src') || '', base);
      if (!/^https?:/.test(src)) continue;
      copy.setAttribute('src', src);
      if (child.getAttribute('alt')) copy.setAttribute('alt', child.getAttribute('alt'));
    }
    copy.append(clean(child, base, doc));
    out.append(copy);
  }
  return out;
}

async function storyText(item) {
  const response = await fetch(item.link, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${response.status}`);
  const html = await response.text();
  // Where the link really ends up, so "show the real page" opens it without a redirect.
  const finalUrl = response.url || item.link;
  const { document } = parseHTML(html);
  const image = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
  const article = new Readability(document).parse();
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const page = /^https:\/\//.test(canonical || '') ? canonical : finalUrl;
  if (!article?.content || (article.textContent || '').trim().split(/\s+/).length < 80) return { image, page };
  const holder = parseHTML(`<div>${article.content}</div>`).document;
  const box = holder.querySelector('div');
  const tidy = holder.createElement('div');
  tidy.append(clean(box, item.link, holder));
  return { image, page, title: article.title || item.title, byline: article.byline || '', html: tidy.innerHTML };
}

/* Locking: AES-GCM with the key only Eames's devices and this job know. */
const keyText = process.env.READER_KEY || '';
const key = keyText ? await webcrypto.subtle.importKey('raw', Buffer.from(keyText, 'base64url'), 'AES-GCM', false, ['encrypt']) : null;
async function lock(value) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  // Squeezed first: locked text can't be squeezed afterwards, and the project keeps every version.
  const data = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, deflateRawSync(Buffer.from(JSON.stringify(value)), { level: 9 }));
  return { iv: Buffer.from(iv).toString('base64url'), data: Buffer.from(data).toString('base64url') };
}

/* Run */
const all = [];
const feedOf = new Map(); // story id -> the feed it came from
let failed = 0;
for (const feed of feeds) {
  try {
    let got = entries(await get(feed.url), feed);
    if (!got.length) got = entries(await get(feed.url, 20000, PLAIN_UA), feed);
    got.forEach((item) => { if (!feedOf.has(item.id)) feedOf.set(item.id, feed.url); });
    all.push(...got);
  } catch (error) {
    failed++;
    console.warn(`feed failed: ${feed.name} (${error.message})`);
    const kept = previous.items.filter((item) => item.source === feed.name && item.group === feed.group);
    kept.forEach((item) => { if (!feedOf.has(item.id)) feedOf.set(item.id, feed.url); });
    all.push(...kept);
  }
}
// Each feed keeps its newest few, so busy news sites can't crowd out a podcast that posts weekly.
// Counted per feed, not per name: The Athletic's four Sport feeds each get their own.
const perFeed = new Map();
for (const item of [...new Map(all.map((entry) => [entry.id, entry])).values()].sort((a, b) => b.time - a.time)) {
  const key = feedOf.get(item.id) || `${item.source}|${item.group}`;
  const list = perFeed.get(key) ?? [];
  if (list.length < PER_FEED) list.push(item);
  perFeed.set(key, list);
}
const unique = [...perFeed.values()].flat().sort((a, b) => b.time - a.time).slice(0, KEEP);

let fetched = 0;
const queue = unique.filter((item) => item.kind === 'article' && !(known.get(item.id)?.textTried) && key);
for (let i = 0; i < queue.length && fetched < NEW_TEXTS_PER_RUN; i += 4) {
  await Promise.all(queue.slice(i, i + 4).map(async (item) => {
    fetched++;
    try {
      const story = await storyText(item);
      if (!item.image && story.image) item.image = absolute(story.image, item.link);
      if (story.page) item.page = story.page;
      if (story.html) {
        writeFileSync(new URL(`a/${item.id}.json`, ROOT), JSON.stringify(await lock({ ...story, link: story.page || item.link })));
        item.hasText = true;
      }
    } catch (error) {
      console.warn(`text failed: ${item.source} (${error.message})`);
    }
    item.textTried = true;
  }));
  await pause(300);
}
for (const item of unique) {
  const before = known.get(item.id);
  if (before?.textTried) { item.textTried = true; item.hasText = before.hasText; item.page = before.page; if (!item.image) item.image = before.image; }
}

// Story text for headlines that have dropped off the list is deleted.
const keepIds = new Set(unique.filter((item) => item.hasText).map((item) => item.id));
for (const file of readdirSync(new URL('a/', ROOT))) {
  if (file.endsWith('.json') && !keepIds.has(file.slice(0, -5))) unlinkSync(new URL(`a/${file}`, ROOT));
}

writeFileSync(new URL('index.json', ROOT), JSON.stringify({ updated: Date.now(), items: unique }));
console.log(`${unique.length} headlines, ${fetched} stories fetched this run, ${keepIds.size} with text, ${failed} feeds failed.`);
if (failed > feeds.length / 2) process.exit(1);
