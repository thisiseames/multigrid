// Your YouTube subscriptions, from the file Google Takeout gives you: subscriptions.csv, on its
// own or still inside the Takeout .zip. Everything is read on this device; nothing is sent.
// The CSV has a header line, then "Channel Id,Channel Url,Channel Title" (the header's wording
// depends on the account's language, so rows are recognised by their channel id, not the header).

const CHANNEL_ID = /^UC[\w-]{22}$/;

/** One CSV line into its fields, with "quoted, fields" and "" for a quote. */
function fields(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { field += '"'; index++; } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { out.push(field); field = ''; } else field += char;
  }
  out.push(field);
  return out.map((value) => value.trim());
}

/** Every channel in the CSV, once each, in the file's order: [{ id, title }]. */
export function parseSubscriptions(text) {
  const found = [];
  const seen = new Set();
  for (const line of String(text || '').replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = fields(line);
    const id = row.find((value) => CHANNEL_ID.test(value));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    // The title is the last field that isn't the id or an address.
    const title = [...row].reverse().find((value) => value && value !== id && !/^https?:\/\//i.test(value)) || id;
    found.push({ id, title });
  }
  return found;
}

const isZip = (bytes) => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Every .csv file inside a .zip, as { name, text }. */
export async function csvFilesInZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The central directory's end record sits in the last 64 KB.
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (view.getUint32(at, true) === 0x06054b50) { end = at; break; }
  }
  if (end === -1) throw new Error('Not a zip file');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = [];
  for (let index = 0; index < count && view.getUint32(at, true) === 0x02014b50; index++) {
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (!/\.csv$/i.test(name) || (method !== 0 && method !== 8)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    files.push({ name, text: decoder.decode(method === 8 ? await inflate(data) : data) });
  }
  return files;
}

/**
 * The channels in a chosen file: the CSV itself, or the Takeout .zip. In a .zip, the
 * subscriptions file is the .csv with the most channels in it (its name depends on the language).
 */
export async function subscriptionsFromFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!isZip(bytes)) return parseSubscriptions(new TextDecoder().decode(bytes));
  const lists = (await csvFilesInZip(buffer)).map((entry) => parseSubscriptions(entry.text));
  return lists.sort((a, b) => b.length - a.length)[0] ?? [];
}

/** The channel id behind a saved YouTube favorite (its uploads list "UU…" is the same channel). */
export function channelOfFavorite(source) {
  const list = source?.youtube?.list || '';
  if (/^UU[\w-]{22}$/.test(list)) return `UC${list.slice(2)}`;
  const channel = source?.youtube?.channel || '';
  return CHANNEL_ID.test(channel) ? channel : '';
}
