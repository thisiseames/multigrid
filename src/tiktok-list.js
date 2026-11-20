// Reads the following list out of a TikTok data export: Following.txt, or the JSON
// export. Text in, usernames out, so it can be tested without a browser.

const HANDLE = /^[a-z0-9._]{1,24}$/i;
const NAME_FIELDS = new Set(['username', 'handle', 'uniqueid']);
const flatKey = (key) => String(key).toLowerCase().replace(/[^a-z]/g, '');

function tidy(list) {
  return [...new Set(list.map((name) => String(name).trim().replace(/^@/, '').toLowerCase()))]
    .filter((name) => HANDLE.test(name))
    .sort();
}

function fromText(text) {
  const names = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*user\s*name\s*:\s*@?([A-Za-z0-9._]+)\s*$/i);
    if (match) names.push(match[1]);
  }
  return names;
}

/** A person entry in the JSON export, under whichever key this version uses. */
function nameIn(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
  for (const [key, value] of Object.entries(item)) {
    if (typeof value === 'string' && NAME_FIELDS.has(flatKey(key))) return value;
  }
  return '';
}

function collectPeople(value, out) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') out.push(item);
      else {
        const name = nameIn(item);
        if (name) out.push(name);
      }
    }
    return;
  }
  if (value && typeof value === 'object') fromJson(value, out);
}

/** Walks the export looking only inside keys that mean "following", never "follower". */
function fromJson(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) fromJson(item, out);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    const flat = flatKey(key);
    if (flat === 'following' || flat === 'followinglist') {
      collectPeople(value, out);
      continue;
    }
    fromJson(value, out);
  }
}

/**
 * `text` is the chosen file, `filename` catches the wrong export before it is read.
 * Returns { names } on success, or { error } with something to show the person.
 */
export function parseFollowingList(text, filename = '') {
  const name = String(filename).toLowerCase();
  if (name.endsWith('.zip')) return { error: 'That is the ZIP file. Double-click it to unpack, then choose Following.txt.' };
  if (/follower/.test(name)) return { error: 'That is your followers list. Choose Following.txt instead.' };
  if (!text || !text.trim()) return { error: 'That file is empty.' };
  const body = text.replace(/^\uFEFF/, '');
  let names = [];
  if (name.endsWith('.json') || /^[[{]/.test(body.trim())) {
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return { error: "That JSON file couldn't be read. Try the export's TXT version instead." };
    }
    const found = [];
    fromJson(data, found);
    names = found;
  } else {
    names = fromText(body);
  }
  const clean = tidy(names);
  if (!clean.length) {
    return { error: "This file doesn't look like a TikTok following list. Choose Following.txt from the export." };
  }
  return { names: clean };
}
