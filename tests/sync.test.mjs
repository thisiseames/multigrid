import test from 'node:test';
import assert from 'node:assert/strict';

const { itemsOf, stamp, merge, seenOf, listsOf, newCode, cleanCode, keysFor, pairKeysFor, seal, unseal } = await import('../src/sync.js');

const fav = (input, name, group = '') => ({ input, name, group });
const lists = (favorites, layouts = []) => ({ favorites, layouts });

test('favorites and saved layouts become keyed items; files stay on their device', () => {
  const items = itemsOf(lists([fav('https://a.test/1', 'CP24', 'NEWS'), fav('local:9:Silo.mkv', 'Silo')], [{ name: 'X', savedAt: 5, workspace: { v: 1 } }]));
  assert.deepEqual(Object.keys(items).sort(), ['f:https://a.test/1', 'l:X']);
  assert.deepEqual(items['f:https://a.test/1'], { name: 'CP24', group: 'NEWS' });
});

test('an event poster travels with its favorite', () => {
  const items = itemsOf(lists([{ input: 'https://a.test/event', name: 'Event', group: 'PPV', poster: 'https://img.test/poster.jpg' }]));
  assert.deepEqual(items['f:https://a.test/event'], { name: 'Event', group: 'PPV', poster: 'https://img.test/poster.jpg' });
});

test('favorite backups travel with the favorite', () => {
  const items = itemsOf(lists([{ input: 'https://a.test/1', name: 'Sky Sports', group: 'Sports', sources: [{ input: 'https://b.test/1', name: 'Sky Sports' }] }]));
  assert.deepEqual(items['f:https://a.test/1'].sources, [{ input: 'https://b.test/1', name: 'Sky Sports' }]);
  const doc = Object.fromEntries(Object.entries(items).map(([key, value]) => [key, { t: 1, v: value }]));
  const out = listsOf(doc, lists([]));
  assert.deepEqual(out.favorites[0].sources, [{ input: 'https://b.test/1', name: 'Sky Sports' }]);
});

test('a followed podcast show syncs with its artwork', () => {
  const items = itemsOf(lists([{ input: 'podcastshow:1439621628', name: 'Front Burner', group: '', logo: 'https://img.test/front.jpg' }]));
  assert.deepEqual(items['f:podcastshow:1439621628'], { name: 'Front Burner', group: '', logo: 'https://img.test/front.jpg' });
});

test('a change is stamped once; nothing changed means nothing to send', () => {
  const items = itemsOf(lists([fav('https://a.test/1', 'CP24')]));
  const first = stamp(items, {}, 100);
  assert.deepEqual(first, { 'f:https://a.test/1': { t: 100, v: { name: 'CP24', group: '' } } });
  assert.deepEqual(stamp(items, seenOf(first), 200), {});
  // Renamed, then removed.
  const renamed = itemsOf(lists([fav('https://a.test/1', 'CP24 Live')]));
  assert.equal(stamp(renamed, seenOf(first), 300)['f:https://a.test/1'].v.name, 'CP24 Live');
  assert.deepEqual(stamp({}, seenOf(first), 400), { 'f:https://a.test/1': { t: 400, v: null } });
});

test('the newer change wins, whichever device made it', () => {
  const laptop = { 'f:a': { t: 10, v: { name: 'Old' } }, 'f:b': { t: 50, v: null } };
  const phone = { 'f:a': { t: 20, v: { name: 'New' } }, 'f:b': { t: 40, v: { name: 'Kept?' } }, 'f:c': { t: 5, v: { name: 'Phone only' } } };
  const both = merge(laptop, phone, 100);
  assert.equal(both['f:a'].v.name, 'New');
  assert.equal(both['f:b'].v, null, 'a later removal beats an older edit');
  assert.equal(both['f:c'].v.name, 'Phone only');
  assert.deepEqual(merge(phone, laptop, 100), both, 'the same either way round');
  // Removals are forgotten after 90 days.
  assert.equal(merge({ 'f:x': { t: 0, v: null } }, {}, 91 * 24 * 3600 * 1000)['f:x'], undefined);
});

test('lists from a doc keep existing favorites in place, add new ones first, and keep files', () => {
  const here = lists([fav('local:1:a.mkv', 'File'), fav('https://a.test/1', 'One'), fav('https://a.test/2', 'Two')]);
  const doc = { 'f:https://a.test/1': { t: 1, v: { name: 'One!', group: 'NEWS' } }, 'f:https://a.test/2': { t: 1, v: null }, 'f:https://a.test/3': { t: 1, v: { name: 'Three', group: '' } }, 'l:X': { t: 1, v: { savedAt: 2, workspace: { v: 1 } } } };
  const out = listsOf(doc, here);
  assert.deepEqual(out.favorites.map((item) => item.input), ['https://a.test/3', 'local:1:a.mkv', 'https://a.test/1']);
  assert.equal(out.favorites[2].name, 'One!');
  assert.deepEqual(out.layouts, [{ name: 'X', savedAt: 2, workspace: { v: 1 } }]);
});

test('codes are 8 letters that are easy to read back, and typing is forgiving', () => {
  for (let i = 0; i < 50; i++) assert.match(newCode(), /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  assert.equal(cleanCode(' k7q2 m9xd '), 'K7Q2M9XD');
});

test('what one device seals, only the same secret opens, and tampering fails', async () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const { lock, sign } = await keysFor(secret);
  assert.equal(sign.length, 32);
  const note = await seal({ items: { 'f:a': { t: 1, v: { name: 'A' } } } }, lock);
  assert.deepEqual(await unseal(note, lock), { items: { 'f:a': { t: 1, v: { name: 'A' } } } });
  const other = await keysFor(crypto.getRandomValues(new Uint8Array(32)));
  assert.equal(await unseal(note, other.lock), null);
  const bytes = Buffer.from(note, 'base64'); bytes[20] ^= 1;
  assert.equal(await unseal(bytes.toString('base64'), lock), null);
  // The same code always gives the same keys, however it's typed.
  const one = await pairKeysFor('K7Q2-M9XD');
  const two = await pairKeysFor('k7q2m9xd');
  assert.deepEqual(one.sign, two.sign);
  assert.deepEqual(await unseal(await seal({ secret: 's' }, one.lock), two.lock), { secret: 's' });
});

test('Continue watching places sync, newest 100, without files or the local save time', () => {
  const places = {
    'embed:https://s.test/watch/1/1/1': { at: 2072, length: 3600, saved: 50, input: 'https://s.test/watch/1/1/1', name: 'MOBLAND', from: '', page: 'https://s.test/watch/1/2/8' },
    'yt:abc': { at: 300, length: 6000, saved: 40, input: 'https://www.youtube.com/watch?v=abc', name: 'Video', from: 'SDS' },
    'file:Silo.mkv:123': { at: 900, length: 3000, saved: 60 },
  };
  const items = itemsOf({ favorites: [], layouts: [], places });
  assert.deepEqual(Object.keys(items).sort(), ['p:embed:https://s.test/watch/1/1/1', 'p:yt:abc']);
  assert.deepEqual(items['p:embed:https://s.test/watch/1/1/1'], { at: 2072, length: 3600, input: 'https://s.test/watch/1/1/1', name: 'MOBLAND', page: 'https://s.test/watch/1/2/8' });
  // Back from a doc: "saved" is when it last changed, so Continue watching keeps its order.
  const doc = stamp(items, {}, 777);
  assert.deepEqual(listsOf(doc, { favorites: [], layouts: [] }).places['yt:abc'], { at: 300, length: 6000, input: 'https://www.youtube.com/watch?v=abc', name: 'Video', from: 'SDS', saved: 777 });
  // Only the newest 100 travel.
  const many = Object.fromEntries(Array.from({ length: 130 }, (_, i) => [`yt:${i}`, { at: 100, length: 1000, saved: i }]));
  const kept = Object.keys(itemsOf({ favorites: [], layouts: [], places: many }));
  assert.equal(kept.length, 100);
  assert.ok(kept.includes('p:yt:129') && !kept.includes('p:yt:0'));
});

test('a room marker travels with its saved workspace', () => {
  const room = { key: 'sports:1', label: 'Liverpool vs Man Utd', kind: 'game', starts: 1000, ends: 0 };
  const workspace = { v: 1, presetId: 'row', cols: [1, 1], rows: [1], tiles: [], room };
  const items = itemsOf({ favorites: [], layouts: [{ name: 'Room · Liverpool vs Man Utd', savedAt: 10, workspace }] });
  assert.deepEqual(items['l:Room · Liverpool vs Man Utd'].workspace.room, room);
  const back = listsOf(stamp(items, {}, 20), { favorites: [], layouts: [] });
  assert.deepEqual(back.layouts[0].workspace.room, room);
});
