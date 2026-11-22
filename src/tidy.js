// Tidy up favorites: what needs sorting in the list, worked out without the page so it can be
// tested. Nothing here changes anything; the page shows the issues and the owner picks each fix.
//   · favorites with no folder, each with a suggested folder where its kind makes it clear
//   · two folders for the same thing (none listed: TWITTER and X are separate on purpose)
//   · the same link saved twice, and the same name on different links

import { parseSource } from './sources.js';
import { isPodcastShowInput } from './podcasts.js';

const same = (a, b) => String(a).toLocaleLowerCase() === String(b).toLocaleLowerCase();
const plain = (name) => String(name || '').trim().toLocaleLowerCase();

// Folder names that mean the same thing: the first gives way to the second. None yet: TWITTER
// and X are different folders to the owner (Nov 22), so nothing is merged on a guess.
const SAME_FOLDERS = [];

// A favorite's kind, and the folder names that hold that kind (the first one that exists wins).
const KIND_FOLDERS = {
  x: ['X', 'Twitter'],
  tiktok: ['TikTok'],
  youtube: ['YouTube'],
  twitch: ['Twitch'],
  kick: ['Kick'],
};

/**
 * What a link points to, so the same thing saved two ways counts once: "https://x.com/acyn" and
 * "x.com/acyn" are one account; an embed snippet is its player's address.
 */
export function linkKey(input) {
  const source = parseSource(String(input || '').trim());
  if (!source.ok) return String(input || '').trim().toLowerCase();
  if (source.kind === 'x' && source.x?.profile && !source.x?.id) return `x:${source.x.profile.toLowerCase()}`;
  if (source.kind === 'tiktok' && source.tiktok?.profile) return `tiktok:${source.tiktok.profile.toLowerCase()}`;
  const address = source.url || source.openUrl || '';
  if (!address) return `${source.kind}:${String(input).trim()}`;
  try {
    const url = new URL(address);
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}${url.search}`.toLowerCase();
  } catch {
    return address.toLowerCase();
  }
}

/** The part of a link that tells it apart: "ehgembxe.cfd/nyigj80x-6445". */
export function linkLabel(input) {
  const key = linkKey(input);
  return key.replace(/^(x|tiktok):/, (_, site) => (site === 'x' ? 'x.com/' : 'tiktok.com/@')).slice(0, 60);
}

/** Hidden ones (followed podcasts, files from this computer) are never listed as issues. */
const listed = (item) => item && typeof item.input === 'string' && !isPodcastShowInput(item.input) && !item.input.startsWith('local:');

/**
 * The folder a favorite with no folder most likely belongs in: an existing folder for its kind
 * (an X account → X, a TikTok account → TIKTOK), or the kind's usual name. '' when its kind
 * says nothing (a channel embed could be news, sport or anything).
 */
export function suggestFolder(item, folders = []) {
  const kind = parseSource(item?.input || '').kind;
  const names = KIND_FOLDERS[kind];
  if (!names) return '';
  for (const name of names) {
    const found = folders.find((folder) => same(folder, name));
    if (found) return found;
  }
  return names[0].toUpperCase();
}

/** Everything worth tidying, and how many fixes it adds up to. */
export function tidyIssues(favorites) {
  const list = (Array.isArray(favorites) ? favorites : []).filter(listed);
  const folders = [...new Set(list.map((item) => item.group).filter(Boolean))];
  const unfiled = list.filter((item) => !item.group).map((item) => ({ item, suggest: suggestFolder(item, folders) }));

  const merges = [];
  for (const [from, to] of SAME_FOLDERS) {
    const a = folders.find((folder) => same(folder, from));
    const b = folders.find((folder) => same(folder, to));
    if (a && b) merges.push({ from: a, to: b, fromCount: list.filter((item) => same(item.group, a)).length, toCount: list.filter((item) => same(item.group, b)).length });
  }

  const byLink = new Map();
  for (const item of list) byLink.set(linkKey(item.input), [...(byLink.get(linkKey(item.input)) ?? []), item]);
  const sameLink = [...byLink.values()].filter((items) => items.length > 1);

  const byName = new Map();
  for (const item of list) byName.set(plain(item.name), [...(byName.get(plain(item.name)) ?? []), item]);
  const sameName = [...byName.values()].filter((items) => items.length > 1 && new Set(items.map((item) => linkKey(item.input))).size > 1);

  return { unfiled, merges, sameLink, sameName, count: unfiled.length + merges.length + sameLink.length + sameName.length };
}

/** "DAZN" with others named DAZN: "DAZN 2", "DAZN 3"… the first free number. */
export function nextName(name, taken) {
  const used = new Set([...taken].map(plain));
  for (let number = 2; number < 100; number++) {
    const candidate = `${name} ${number}`;
    if (!used.has(plain(candidate))) return candidate;
  }
  return name;
}
