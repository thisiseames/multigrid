import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { movementOf } from '../tools/chart-rows.mjs';

// Shaped like billboard.com's chart rows (Nov 21, 2026).
const row = (inner) => parseHTML(`<ul class="o-chart-results-list-row">${inner}</ul>`).document.querySelector('ul');
const stats = (lw, peak, weeks) => `<li><span>LW</span> <span>${lw}</span> <span>PEAK</span> <span>${peak}</span> <span>WEEKS ON CHART</span> <span>${weeks}</span></li>`;

test('an entry that moved has last week’s position', () => {
  assert.deepEqual(movementOf(row(`<li><span>2</span></li><li><h3 id="title-of-a-story">Boston</h3></li>${stats(5, 2, 32)}`)), { last: 5 });
});

test('a number one that stayed, with weeks at No. 1 in the row too', () => {
  const html = `<li><span>1</span></li><li><h3 id="title-of-a-story">Choosin' Texas</h3></li>
    <li><span>LW</span> <span>1</span> <span>PEAK</span> <span>1</span> <span>WEEKS AT NO. 1</span> <span>28</span> <span>WEEKS ON CHART</span> <span>56</span></li>`;
  assert.deepEqual(movementOf(row(html)), { last: 1 });
});

test('a debut and a return are badged, with no last week', () => {
  assert.deepEqual(movementOf(row(`<li><span>2</span> <span class="c-label">NEW</span></li><li><h3 id="title-of-a-story">FRESH</h3></li>${stats('-', 2, 1)}`)), { mark: 'new' });
  assert.deepEqual(movementOf(row(`<li><span>28</span> <span class="c-label">RE-ENTRY</span></li><li><h3 id="title-of-a-story">Jingle Bell Rock</h3></li>${stats('-', 2, 69)}`)), { mark: 're-entry' });
});

test('a title with the word new in it is not a debut', () => {
  assert.deepEqual(movementOf(row(`<li><h3 id="title-of-a-story"><span>New</span> Rules</h3></li>${stats(7, 3, 9)}`)), { last: 7 });
});

test('a row Billboard changed shape on gives nothing, rather than a wrong mark', () => {
  assert.deepEqual(movementOf(row('<li><h3 id="title-of-a-story">Something</h3></li>')), {});
});
