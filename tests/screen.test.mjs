import test from 'node:test';
import assert from 'node:assert/strict';
import { newScreenId, parseScreenInput, screenInput, screenSupported } from '../src/screen.js';
import { parseSource } from '../src/sources.js';

test('screen shares round-trip their label and stay in the screen source kind', () => {
  const input = screenInput('abc-123', 'Chrome — Entire screen');
  assert.match(input, /^screen:abc-123:/);
  const parsed = parseScreenInput(input);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.kind, 'screen');
  assert.equal(parsed.screenId, 'abc-123');
  assert.equal(parsed.label, 'Chrome — Entire screen');
  assert.equal(parseSource(input).kind, 'screen');
  assert.equal(parseScreenInput('screen:').ok, false);
  assert.equal(parseScreenInput('https://example.com').ok, false);
});

test('screen IDs are unique and screen capture is absent in Node', () => {
  const ids = new Set(Array.from({ length: 20 }, () => newScreenId()));
  assert.equal(ids.size, 20);
  assert.equal(screenSupported(), false);
});
