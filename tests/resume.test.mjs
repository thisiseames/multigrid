import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.document ??= { addEventListener() {}, removeEventListener() {} };
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { listPlaces, notePlace } = await import('../src/resume.js');

test('Continue watching: the last 10% counts as finished, so outros and end screens don\'t keep a video on the list', () => {
  const meta = { input: 'https://www.youtube.com/watch?v=abcdefghijk', name: 'Is Pochettino the answer?', from: 'Proper Saturday' };
  notePlace('yt:abcdefghijk', 30 * 60, 60 * 60, meta);
  assert.equal(listPlaces().length, 1, 'halfway: on the list');
  notePlace('yt:abcdefghijk', 55 * 60, 60 * 60, meta);
  assert.equal(listPlaces().length, 0, 'at 92%: finished');
  // A place saved before the change, already past 90%, drops out too.
  store.set('multigrid.resume.v1', JSON.stringify({ 'yt:old': { at: 92, length: 100, saved: 1, input: 'x', name: 'Old' } }));
  assert.equal(listPlaces().length, 0);
});
