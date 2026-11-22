import test from 'node:test';
import assert from 'node:assert/strict';
import { nextName, suggestFolder, tidyIssues } from '../src/tidy.js';

const fav = (input, name, group = '') => ({ input, name, group });

test('folderless favorites, each with a folder suggested from what it is', () => {
  const list = [
    fav('https://x.com/acyn', '@acyn'),
    fav('https://www.tiktok.com/@dropsitenews', '@dropsitenews'),
    fav('https://www.youtube.com/watch?v=abcdefghijk', 'A video'),
    fav('https://ehgembxe.cfd/embed/123', 'AMC'),
    fav('https://x.com/other', '@other', 'X'),
    fav('https://www.tiktok.com/@a', '@a', 'TIKTOK'),
  ];
  const { unfiled } = tidyIssues(list);
  assert.deepEqual(unfiled.map(({ item, suggest }) => [item.name, suggest]), [['@acyn', 'X'], ['@dropsitenews', 'TIKTOK'], ['A video', 'YOUTUBE'], ['AMC', '']]);
  // An existing folder's own spelling wins; with no folder for X, Twitter is used if it exists.
  assert.equal(suggestFolder(fav('https://x.com/a', 'a'), ['Twitter']), 'Twitter');
  assert.equal(suggestFolder(fav('https://x.com/a', 'a'), ['x', 'Twitter']), 'x');
});

test('two folders for one thing, the same link twice, the same name on different links', () => {
  const list = [
    fav('https://x.com/a', '@a', 'TWITTER'), fav('https://x.com/b', '@b', 'TWITTER'), fav('https://x.com/c', '@c', 'X'),
    fav('https://dazn.example/1', 'DAZN', 'SPORTS'), fav('https://dazn.example/2', 'dazn ', 'SPORTS'),
    fav('https://same.example/', 'One'), fav('https://same.example/ ', 'Two'),
    fav('podcastshow:123', 'A podcast'), fav('local:abc:clip.mp4', 'A file'),
  ];
  const issues = tidyIssues(list);
  assert.deepEqual(issues.merges, [{ from: 'TWITTER', to: 'X', fromCount: 2, toCount: 1 }]);
  assert.deepEqual(issues.sameName.map((items) => items.map((item) => item.input)), [['https://dazn.example/1', 'https://dazn.example/2']]);
  assert.equal(issues.sameLink.length, 1);
  // Hidden favorites (followed podcasts, files on this computer) are never issues.
  assert.ok(!issues.unfiled.some(({ item }) => /podcast|local/.test(item.input)));
  assert.equal(issues.count, issues.unfiled.length + 1 + 1 + 1);
  assert.equal(tidyIssues([]).count, 0);
});

test('a new name for one of two with the same name', () => {
  assert.equal(nextName('DAZN', ['DAZN', 'DAZN 2', 'Sky']), 'DAZN 3');
  assert.equal(nextName('@acyn', ['@acyn']), '@acyn 2');
});

test('the same account saved two ways is one link', async () => {
  const { linkKey, linkLabel } = await import('../src/tidy.js');
  assert.equal(linkKey('https://x.com/acyn'), linkKey('x.com/acyn'));
  assert.equal(linkKey('https://www.tiktok.com/@dropsitenews'), linkKey('tiktok.com/@dropsitenews'));
  assert.notEqual(linkKey('<iframe src="https://ehgembxe.cfd/nyigj80x-6445"></iframe>'), linkKey('<iframe src="https://ehgembxe.cfd/0uhlhcdr-5706"></iframe>'));
  assert.equal(linkLabel('<iframe src="https://ehgembxe.cfd/nyigj80x-6445" width="100%"></iframe>'), 'ehgembxe.cfd/nyigj80x-6445');
  const issues = tidyIssues([fav('https://x.com/acyn', '@acyn', 'TWITTER'), fav('x.com/acyn', '@acyn', 'TWITTER')]);
  assert.equal(issues.sameLink.length, 1);
  assert.equal(issues.sameName.length, 0);
});
