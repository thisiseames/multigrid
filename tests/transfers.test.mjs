import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEXT_WINDOW, leagueLatest, parseTransferPlaylist, sourceTier, squadGroups, transferNews, transferType, windowState,
} from '../src/transfers.js';

const item = (title, description, tag, date, link = '') => ({
  response: { title, description, date, tags: [{ label: tag }], links: link ? [{ promoUrl: link }] : [] },
});

test('transfer rows read the player, direction, club, date and link', () => {
  const rows = parseTransferPlaylist({
    items: [
      item('Carlos Baleba', '- Brighton', 'transfer-in', '2026-08-25T15:36:00Z', 'https://www.manutd.com/baleba'),
      item('Jadon Sancho', '', 'player-released', '2026-06-30T12:00:00Z'),
      item('Rasmus Hojlund', '- Napoli', 'transfer-out', '2026-06-01T12:00:00Z'),
      item('Carlos Baleba', '- Brighton', 'transfer-in', '2026-08-25T15:36:00Z'),
    ],
  });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    player: 'Carlos Baleba', direction: 'in', kind: 'Signed', club: 'Brighton',
    date: Date.parse('2026-08-25T15:36:00Z'), link: 'https://www.manutd.com/baleba',
  });
  assert.equal(rows.find((row) => row.player === 'Jadon Sancho').kind, 'Released');
  assert.equal(rows.find((row) => row.player === 'Rasmus Hojlund').direction, 'out');
});

test('transfer types cover loans and releases', () => {
  assert.deepEqual(transferType([{ label: 'loan-in' }]), { direction: 'in', label: 'Loan in' });
  assert.deepEqual(transferType(['loan-out']), { direction: 'out', label: 'Loan out' });
  assert.deepEqual(transferType([{ label: 'player-released' }]), { direction: 'out', label: 'Released' });
});

test('the league board takes one latest deal per club', () => {
  const rows = leagueLatest({
    items: [
      { response: { title: 'Summer 2026 - Transfer Centre - Man Utd', coverItem: { title: 'Carlos Baleba', tags: [{ label: 'transfer-in' }], date: '2026-08-25T15:36:00Z' } } },
      { response: { title: 'Summer 2026 - Transfer Centre - Arsenal', coverItem: { title: 'Ethan Nwaneri', tags: [{ label: 'loan-out' }], date: '2026-08-30T10:00:00Z' } } },
    ],
  });
  assert.deepEqual(rows.map((row) => [row.club, row.player, row.direction]), [
    ['Arsenal', 'Ethan Nwaneri', 'out'],
    ['Man Utd', 'Carlos Baleba', 'in'],
  ]);
});

test('the squad counts by ESPN position and averages ages', () => {
  const groups = squadGroups([
    { fullName: 'Keeper One', position: { abbreviation: 'G' }, age: 30 },
    { fullName: 'Keeper Two', position: { abbreviation: 'G' }, age: 20 },
    { fullName: 'Defender', position: { abbreviation: 'D' }, age: 25 },
    { fullName: 'Midfielder', position: { abbreviation: 'M' }, age: 23 },
    { fullName: 'Forward', position: { abbreviation: 'F' }, age: 21 },
  ]);
  assert.deepEqual(groups.map((group) => [group.short, group.count, group.avgAge]), [
    ['GK', 2, 25], ['DEF', 1, 25], ['MID', 1, 23], ['FWD', 1, 21],
  ]);
});

test('United transfer stories are deduped, newest first, and other clubs are separate', () => {
  const items = [
    { title: 'Man Utd close in on Baleba deal', summary: 'Transfer talks', source: 'BBC Sport', time: 5 },
    { title: 'Liverpool sign winger', summary: 'transfer', source: 'Sky Sports', group: 'Sport', time: 4 },
    { title: 'Man Utd transfer latest', summary: 'The latest', source: 'The Athletic', time: 3 },
    { title: 'Man Utd close in on Baleba deal', summary: 'duplicate', source: 'ESPN', time: 2 },
    { title: 'Match report', summary: 'no keywords here', source: 'BBC Sport', group: 'Sport', time: 1 },
    { title: 'Climate talks collapse after deal rejected', summary: 'World leaders leave the table', source: 'CBC', group: 'News', time: 6 },
    { title: 'Fifa to confirm UK bid to host 2035 World Cup', summary: 'A football tournament hosted in the UK', source: 'BBC Sport', group: 'Sport', time: 7 },
    { title: 'Pochettino’s bounce falls flat with De Ligt move', summary: 'Manchester United fell apart at Anfield', source: 'The Guardian', group: 'Sport', time: 8 },
  ];
  const united = transferNews(items);
  assert.deepEqual(united.map((row) => row.title), ['Man Utd close in on Baleba deal', 'Man Utd transfer latest']);
  assert.deepEqual(transferNews(items, { united: false }).map((row) => row.title), ['Liverpool sign winger']);
  const first = united[0].title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  assert.deepEqual(transferNews(items, { exclude: new Set([first]) }).map((row) => row.title), ['Man Utd transfer latest']);
  assert.equal(sourceTier('BBC Sport'), 1);
  assert.equal(sourceTier('A Fan Blog'), 2);
});

test('the window countdown knows closed, open and expired', () => {
  assert.deepEqual(windowState(Date.UTC(2026, 11, 1), NEXT_WINDOW), {
    open: false, opens: NEXT_WINDOW.opens, closes: NEXT_WINDOW.closes, days: 31,
  });
  const open = windowState(Date.UTC(2027, 0, 15), NEXT_WINDOW);
  assert.equal(open.open, true);
  assert.ok(open.days > 0);
  const closed = windowState(Date.UTC(2027, 1, 2), NEXT_WINDOW);
  assert.equal(closed.open, false);
  assert.equal(closed.opens, 0);
  assert.equal(closed.days, 0);
});
