import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, collect, moveLink, readMove } from '../src/move.js';

const store = (entries = {}) => {
  const map = new Map(Object.entries(entries));
  return { get length() { return map.size; }, key: (i) => [...map.keys()][i] ?? null, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
};

test('a move link carries every MULTIGRID setting and list, but not caches or other sites\' data', async () => {
  const from = store({
    'multigrid.favorites.v1': JSON.stringify([{ input: 'UCyFoulEppT3kYN_cSt11M8Q', name: 'JOHN KIRIAKOU', group: 'YOUTUBE' }]),
    'multigrid.sync.v1': JSON.stringify({ secret: 'c2VjcmV0', device: 'abc' }),
    'multigrid.readerkey.v1': 'key',
    'multigrid.tiktok.following': '["a","b"]',
    'multigrid.weather.v2': '{"big":"cache"}',
    'multigrid.avatars.v1': '{}',
    'other.app': 'not ours',
  });
  assert.deepEqual(Object.keys(collect(from)).sort(), ['multigrid.favorites.v1', 'multigrid.readerkey.v1', 'multigrid.sync.v1', 'multigrid.tiktok.following']);
  const link = await moveLink('https://multigrid.club/', from);
  assert.ok(link.startsWith('https://multigrid.club/#move='));
  const to = store();
  const data = await readMove(link);
  assert.equal(applyMove(data, to), 4);
  assert.equal(to.getItem('multigrid.readerkey.v1'), 'key');
  assert.deepEqual(JSON.parse(to.getItem('multigrid.sync.v1')), { secret: 'c2VjcmV0', device: 'abc' });
  // Pasted with stray spaces or line breaks around it still works; anything else is ignored.
  assert.ok(await readMove(`  ${link}\n`));
  assert.equal(await readMove('https://multigrid.club/'), null);
  assert.equal(await readMove('https://multigrid.club/#move=garbage!!'), null);
});
