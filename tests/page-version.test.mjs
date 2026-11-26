import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('the page reloads itself when its markup is older than the live one', () => {
  assert.match(page, /multigrid\.page\.v1/);
  assert.match(page, /if \(seen && seen !== pageVersion\)/);
  assert.match(page, /searchParams\.set\('mgv', String\(Date\.now\(\)\)\)/);
  assert.match(page, /window\.__mgPageVersion = pageVersion/);
});

test('app.js rescues a page cached before the start-up version check', () => {
  assert.match(app, /if \(!window\.__mgPageVersion\)/);
  assert.match(app, /searchParams\.has\('mgv'\)/);
  assert.match(app, /searchParams\.set\('mgv', String\(Date\.now\(\)\)\)/);
});

test('the iPhone launch screen is black, not white', () => {
  assert.match(page, /apple-touch-startup-image/);
  assert.match(page, /assets\/startup-1170x2532\.png/);
  assert.match(page, /html, body \{ background: #000; color-scheme: dark; \}/);
  assert.match(page, /<meta name="color-scheme" content="dark">/);
});
