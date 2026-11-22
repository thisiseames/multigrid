import test from 'node:test';
import assert from 'node:assert/strict';
import { bestBackdrop, plainText, sameName } from '../src/artwork.js';

test('only the same show counts, however it is written', () => {
  assert.ok(sameName('THE WALKING DEAD', 'The Walking Dead'));
  assert.ok(sameName("Hell's Kitchen", 'Hells Kitchen'));
  assert.ok(sameName('Law & Order', 'Law and Order'));
  assert.ok(!sameName('PL: Spurs v Ipswich Town Hlts', 'Spurs'));
  assert.ok(!sameName('', ''));
});

test('the widest-fitting background is chosen, and summaries lose their HTML', () => {
  const img = (type, width, url, main = false) => ({ type, main, resolutions: { original: { width, url } } });
  assert.equal(bestBackdrop([img('poster', 2000, 'p'), img('background', 3840, 'big'), img('background', 1920, 'fit'), img('background', 800, 'small')]), 'fit');
  assert.equal(bestBackdrop([img('poster', 2000, 'p')]), '');
  assert.equal(plainText('<p>With the <b>most</b> powerful &amp; rich</p>'), 'With the most powerful & rich');
});
